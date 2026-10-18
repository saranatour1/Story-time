import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import { requireEventAccess } from "../lib/access";
import { recordChange } from "../lib/changes";
import { vGrantRole } from "../schema";

// Grants an experience can hold. shortcut: members reads this many, raise it if trips grow past it.
const MAX_MEMBERS = 200;

// Everyone on the trip, owner first: names and roles, for anyone with access.
// Nothing about when they joined or were last seen; that stays the owner's.
const members = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const grants = await ctx.db
      .query("sessions")
      .withIndex("by_event_and_user", (q) => q.eq("eventId", args.eventId))
      .take(MAX_MEMBERS);
    const owner = await ctx.db.get("users", event.ownerId);
    const active = grants.filter((s) => s.revokedAt === undefined);
    return [
      {
        userId: event.ownerId,
        displayName: owner?.displayName,
        role: "owner" as const,
        sessionId: null,
      },
      ...(await Promise.all(
        active.map(async (s) => ({
          userId: s.userId,
          displayName: (await ctx.db.get("users", s.userId))?.displayName,
          role: s.role,
          sessionId: s._id,
        })),
      )),
    ];
  },
});

// The people with access, one page at a time, in index order (by person).
const listForEvent = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const page = await ctx.db
      .query("sessions")
      .withIndex("by_event_and_user", (q) => q.eq("eventId", args.eventId))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (s) => {
          const user = await ctx.db.get("users", s.userId);
          return {
            _id: s._id,
            userId: s.userId,
            displayName: user?.displayName,
            role: s.role,
            grantedAt: s._creationTime,
            lastSeenAt: s.lastSeenAt,
            revokedAt: s.revokedAt,
          };
        }),
      ),
    };
  },
});

// Revoke access: every read and write checks for an active grant.
const revoke = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    // A missing grant fails exactly like one on an experience the caller doesn't
    // own, so session ids can't be probed.
    if (session === null) throw new Error("Event not found");
    const { userId } = await requireEventAccess(ctx, session.eventId, "owner");
    if (session.revokedAt !== undefined) return null;
    await ctx.db.patch("sessions", args.sessionId, { revokedAt: Date.now() });
    await recordChange(ctx, {
      eventId: session.eventId,
      entity: "session",
      entityId: args.sessionId,
      actorId: userId,
      action: "revoke",
      fields: ["revokedAt"],
      after: { role: session.role },
    });
    return null;
  },
});

// Change what someone may do: watch, add moments, or co-own. Owners only.
const setRole = mutation({
  args: { sessionId: v.id("sessions"), role: vGrantRole },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    // Missing fails like forbidden, so session ids can't be probed.
    if (session === null) throw new Error("Event not found");
    const { userId } = await requireEventAccess(ctx, session.eventId, "owner");
    if (session.revokedAt !== undefined) {
      throw new ConvexError({
        code: "REVOKED",
        message: "Their access was removed. Invite them again to give it back.",
      });
    }
    if (session.role === args.role) return null;
    await ctx.db.patch("sessions", args.sessionId, { role: args.role });
    await recordChange(ctx, {
      eventId: session.eventId,
      entity: "session",
      entityId: args.sessionId,
      actorId: userId,
      action: "update",
      fields: ["role"],
      before: { role: session.role },
      after: { role: args.role },
    });
    return null;
  },
});

// What the app calls. Registered once, by convex/api/sessions.ts, which re-exports it.
export const sessionsApi = { listForEvent, members, revoke, setRole };
