import { ConvexError, v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import { assertNotArchived, requireEventAccess, requireUserId } from "../lib/access";
import { appOrigin } from "../lib/appUrl";
import { emailConfigured, queueMail, replyAddress } from "../lib/emailAddress";
import { recordChange } from "../lib/changes";
import { vRole } from "../schema";
import { INVITE_EMAILS_PER_DAY, MAX_INVITE_DAYS, MAX_WAITING_INVITES } from "../lib/limits";
import { chargeEmail } from "../lib/rateLimit";

const DAY_MS = 24 * 60 * 60 * 1000;

const create = mutation({
  args: {
    eventId: v.id("events"),
    role: vRole,
    ttlDays: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    sendTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const waiting = await ctx.runQuery(components.invites.lib.listForEvent, {
      eventId: args.eventId,
    });
    if (waiting.length >= MAX_WAITING_INVITES) {
      throw new ConvexError({
        code: "LIMIT",
        message: `This experience has ${MAX_WAITING_INVITES} invites waiting to be opened. Cancel some first.`,
      });
    }
    const now = Date.now();
    if (args.expiresAt !== undefined && args.expiresAt <= now) {
      throw new ConvexError({
        code: "INVALID",
        field: "expiresAt",
        message: "Pick an expiry date in the future",
      });
    }
    const sendTo = args.sendTo?.trim() ?? "";
    if (sendTo !== "" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendTo) || sendTo.length > 254)) {
      throw new ConvexError({
        code: "INVALID",
        field: "sendTo",
        message: "Enter a valid email address",
      });
    }
    const emailed = sendTo !== "" && emailConfigured();
    if (emailed)
      await chargeEmail(
        ctx,
        "inviteEmail",
        userId,
        `You can email up to ${INVITE_EMAILS_PER_DAY} invites a day. Create a link without an email and share it yourself.`,
      );
    const ttlMs =
      args.expiresAt !== undefined
        ? Math.min(args.expiresAt - now, MAX_INVITE_DAYS * DAY_MS)
        : Math.min(Math.max(args.ttlDays ?? 7, 1), 14) * DAY_MS;
    const { token, expiresAt, inviteId } = await ctx.runMutation(components.invites.lib.create, {
      eventId: args.eventId,
      invitedBy: userId,
      role: args.role,
      ttlMs,
    });
    const link = `${appOrigin()}/invite#${token}`;

    if (emailed) {
      const replyTo = await replyAddress(ctx, userId);
      await queueMail(ctx, {
        to: sendTo,
        ...(replyTo === undefined ? {} : { replyTo }),
        subject: `You're invited to "${event.title}"`,
        html: `<p>You've been invited to a shared experience on Story-time.</p><p><a href="${link}">Open the invite</a></p><p>The link works for the first person who opens it and expires on ${new Date(expiresAt).toUTCString()}.</p>`,
        text: `You've been invited to "${event.title}" on Story-time.\n${link}\nThe link works for the first person who opens it and expires on ${new Date(expiresAt).toUTCString()}.`,
      });
    }

    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "invite",
      entityId: inviteId,
      actorId: userId,
      action: "create",
      fields: ["role", "expiresAt"],
      after: { role: args.role, expiresAt },
    });
    return { link, expiresAt, emailed };
  },
});

const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.runQuery(components.invites.lib.lookup, {
      token: args.token,
    });
    const eventId =
      invite === null || invite.expiresAt < Date.now()
        ? null
        : ctx.db.normalizeId("events", invite.eventId);
    const event = eventId === null ? null : await ctx.db.get("events", eventId);
    if (invite === null || event === null) {
      throw new ConvexError({
        code: "INVITE_INVALID",
        message: "This invite has expired or was already used",
      });
    }
    if (event.ownerId === userId) return { eventId: event._id };

    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_event_and_user", (q) => q.eq("eventId", event._id).eq("userId", userId))
      .unique();
    if (existing?.revokedAt !== undefined && invite.createdAt < existing.revokedAt) {
      throw new ConvexError({
        code: "INVITE_INVALID",
        message: "This invite has expired or was already used",
      });
    }
    if (
      existing !== null &&
      existing.revokedAt === undefined &&
      (existing.role !== "viewer" || invite.role === "viewer")
    ) {
      return { eventId: event._id };
    }
    assertNotArchived(event);
    const consumed = await ctx.runMutation(components.invites.lib.consume, {
      token: args.token,
    });
    if (consumed === null) {
      throw new ConvexError({
        code: "INVITE_INVALID",
        message: "This invite has expired or was already used",
      });
    }
    const grantedBy = ctx.db.normalizeId("users", invite.invitedBy) ?? event.ownerId;
    let sessionId;
    if (existing === null) {
      sessionId = await ctx.db.insert("sessions", {
        eventId: event._id,
        userId,
        grantedBy,
        role: invite.role,
      });
    } else {
      sessionId = existing._id;
      await ctx.db.patch("sessions", existing._id, {
        role: invite.role,
        revokedAt: undefined,
      });
    }
    await recordChange(ctx, {
      eventId: event._id,
      entity: "session",
      entityId: sessionId,
      actorId: userId,
      action: "accept",
      fields: ["role"],
      after: { role: invite.role },
    });
    return { eventId: event._id };
  },
});

const dismiss = mutation({
  args: { eventId: v.id("events"), inviteId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "owner");
    const deleted = await ctx.runMutation(components.invites.lib.dismiss, {
      inviteId: args.inviteId,
      eventId: args.eventId,
    });
    if (deleted) {
      await recordChange(ctx, {
        eventId: args.eventId,
        entity: "invite",
        entityId: args.inviteId,
        actorId: userId,
        action: "dismiss",
        fields: [],
      });
    }
    return null;
  },
});

const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    return await ctx.runQuery(components.invites.lib.listForEvent, {
      eventId: args.eventId,
    });
  },
});

const SWEEP_BATCH = 100;

export const sweepExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const deleted = await ctx.runMutation(components.invites.lib.sweep, {
      limit: SWEEP_BATCH,
    });
    if (deleted === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.model.invites.sweepExpired, {});
    }
    return deleted;
  },
});

export const invitesApi = { create, accept, dismiss, listForEvent };
