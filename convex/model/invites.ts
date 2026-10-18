import { ConvexError, v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { assertNotArchived, requireEventAccess, requireUserId } from "../lib/access";
import { appOrigin } from "../lib/appUrl";
import { emailConfigured, replyAddress } from "../lib/emailAddress";
import { recordChange } from "../lib/changes";
import { vRole } from "../schema";
import { INVITE_EMAILS_PER_DAY, MAX_WAITING_INVITES } from "../lib/limits";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAILS_PER_DAY = INVITE_EMAILS_PER_DAY;

// Counts invite emails per sender over a rolling day, so the form can't be
// used to mail arbitrary addresses in bulk.
const chargeInviteEmail = async (ctx: MutationCtx, userId: Id<"users">) => {
  const since = Date.now() - DAY_MS;
  const recent = await ctx.db
    .query("inviteEmails")
    .withIndex("by_user", (q) => q.eq("userId", userId).gt("_creationTime", since))
    .take(EMAILS_PER_DAY);
  if (recent.length >= EMAILS_PER_DAY) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: `You can email up to ${EMAILS_PER_DAY} invites a day. Create a link without an email and share it yourself.`,
    });
  }
  // Rows older than the window are no longer needed.
  const stale = await ctx.db
    .query("inviteEmails")
    .withIndex("by_user", (q) => q.eq("userId", userId).lte("_creationTime", since))
    .take(EMAILS_PER_DAY);
  for (const row of stale) await ctx.db.delete("inviteEmails", row._id);
  await ctx.db.insert("inviteEmails", { userId });
};

// Invites waiting to be opened, per experience. The list shows them all.

// Owner creates an invite. The link is returned once; if an email address is
// given, it is passed to the email component and not stored by us.
// `emailed` is false when no address was given or email isn't set up.
const create = mutation({
  args: {
    eventId: v.id("events"),
    role: vRole,
    ttlDays: v.optional(v.number()),
    sendTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    // Before any email is charged. Used and expired invites are deleted, so
    // the list holds only the ones still waiting.
    const waiting = await ctx.runQuery(components.invites.lib.listForEvent, {
      eventId: args.eventId,
    });
    if (waiting.length >= MAX_WAITING_INVITES) {
      throw new ConvexError({
        code: "LIMIT",
        message: `This experience has ${MAX_WAITING_INVITES} invites waiting to be opened. Cancel some first.`,
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
    // Unconfigured, the email component could only mark the send failed.
    const emailed = sendTo !== "" && emailConfigured();
    if (emailed) await chargeInviteEmail(ctx, userId);
    const ttlDays = Math.min(Math.max(args.ttlDays ?? 7, 1), 14);
    const { token, expiresAt, inviteId } = await ctx.runMutation(components.invites.lib.create, {
      eventId: args.eventId,
      invitedBy: userId,
      role: args.role,
      ttlMs: ttlDays * DAY_MS,
    });
    // After "#", so the token never reaches a server log or a Referer header.
    const link = `${appOrigin()}/invite#${token}`;

    if (emailed) {
      const replyTo = await replyAddress(ctx, userId);
      await ctx.runMutation(components.email.lib.send, {
        to: sendTo,
        ...(replyTo === undefined ? {} : { replyTo }),
        subject: `You're invited to "${event.title}"`,
        html: `<p>You've been invited to a shared experience on Story-time.</p><p><a href="${link}">Open the invite</a></p><p>The link works for the first person who opens it and expires on ${new Date(expiresAt).toUTCString()}.</p>`,
        text: `You've been invited to "${event.title}" on Story-time.\n${link}\nThe link works for the first person who opens it and expires on ${new Date(expiresAt).toUTCString()}.`,
      });
    }

    // Logs the action only: never the token, link or email address.
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

// Signed-in user redeems a link. The invite is deleted only when it grants
// something: the owner testing their own link, or a guest who already has
// that much access, leaves it usable.
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
    // A link made before someone's access was revoked can't bring it back
    // (say, one they opened while they still had access): that takes a new
    // invite.
    if (existing?.revokedAt !== undefined && invite.createdAt < existing.revokedAt) {
      throw new ConvexError({
        code: "INVITE_INVALID",
        message: "This invite has expired or was already used",
      });
    }
    // A link never downgrades: not a contributor to viewer, nor a co-owner at all.
    if (
      existing !== null &&
      existing.revokedAt === undefined &&
      (existing.role !== "viewer" || invite.role === "viewer")
    ) {
      return { eventId: event._id };
    }
    // Archived experiences take no new people; the link stays unused.
    assertNotArchived(event);
    const consumed = await ctx.runMutation(components.invites.lib.consume, {
      token: args.token,
    });
    // Taken between the lookup and here: refuse, and the throw rolls back the
    // whole accept, so nothing is granted on a spent link.
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
      // Re-inviting someone whose access was revoked restores it.
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

// "Not important anymore": the invite row is hard-deleted.
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

// Called by the daily cron (crons can't target a component function directly).
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

// What the app calls. Registered once, by convex/api/invites.ts, which re-exports it.
export const invitesApi = { create, accept, dismiss, listForEvent };
