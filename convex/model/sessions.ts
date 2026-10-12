import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import { requireEventAccess } from "../lib/access";
import { recordChange } from "../lib/changes";
import { vRole } from "../schema";

const vGrant = v.object({
  _id: v.id("sessions"),
  userId: v.id("users"),
  displayName: v.optional(v.string()),
  role: vRole,
  grantedAt: v.number(),
  lastSeenAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});

// The people with access, one page at a time, in index order (by person).
const listForEvent = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vGrant),
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
  returns: v.null(),
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

// What the app calls. Registered once, by convex/api/sessions.ts, which re-exports it.
export const sessionsApi = { listForEvent, revoke };
