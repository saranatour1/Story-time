import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { env, internalMutation, mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess, requireUserId } from "./lib/access";
import { recordChange } from "./lib/changes";
import { vRole } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

// Owner creates an invite. The link is returned once; if an email address is
// given, it is passed to the email component and not stored by us.
export const create = mutation({
  args: {
    eventId: v.id("events"),
    role: vRole,
    ttlDays: v.optional(v.number()),
    sendTo: v.optional(v.string()),
  },
  returns: v.object({ link: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "owner",
    );
    assertNotArchived(event);
    const ttlDays = Math.min(Math.max(args.ttlDays ?? 7, 1), 14);
    const { token, expiresAt, inviteId } = await ctx.runMutation(
      components.invites.lib.create,
      {
        eventId: args.eventId,
        invitedBy: userId,
        role: args.role,
        ttlMs: ttlDays * DAY_MS,
      },
    );
    const base = env.APP_URL ?? "http://localhost:3000";
    const link = `${base}/invite/${token}`;

    if (args.sendTo !== undefined && args.sendTo.trim() !== "") {
      await ctx.runMutation(components.email.lib.send, {
        to: args.sendTo.trim(),
        subject: `You're invited to "${event.title}"`,
        html: `<p>You've been invited to a shared experience on Story-time.</p><p><a href="${link}">Open the invite</a></p><p>The link works once and expires on ${new Date(expiresAt).toUTCString()}.</p>`,
        text: `You've been invited to "${event.title}" on Story-time.\n${link}\nThe link works once and expires on ${new Date(expiresAt).toUTCString()}.`,
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
    return { link, expiresAt };
  },
});

// Signed-in user redeems a link. The invite is deleted as it is used.
export const accept = mutation({
  args: { token: v.string() },
  returns: v.object({ eventId: v.id("events") }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.runMutation(components.invites.lib.consume, {
      token: args.token,
    });
    const eventId =
      invite === null ? null : ctx.db.normalizeId("events", invite.eventId);
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
      .withIndex("by_event_and_user", (q) =>
        q.eq("eventId", event._id).eq("userId", userId),
      )
      .unique();
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
export const dismiss = mutation({
  args: { eventId: v.id("events"), inviteId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "owner");
    const deleted = await ctx.runMutation(components.invites.lib.dismiss, {
      inviteId: args.inviteId as never,
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

export const listForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({ inviteId: v.string(), role: vRole, expiresAt: v.number() }),
  ),
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
      await ctx.scheduler.runAfter(0, internal.invites.sweepExpired, {});
    }
    return deleted;
  },
});
