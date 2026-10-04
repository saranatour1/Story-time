import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
export type EventRole = "owner" | "contributor" | "viewer";

const RANK: Record<EventRole, number> = { viewer: 0, contributor: 1, owner: 2 };

export async function getUserId(ctx: Ctx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return ctx.db.normalizeId("users", identity.subject);
}

export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

// Role of the signed-in user on an event, or null when they have no active
// share grant. A revoked session grants nothing.
export async function getEventAccess(
  ctx: Ctx,
  eventId: Id<"events">,
): Promise<{
  userId: Id<"users">;
  event: Doc<"events">;
  role: EventRole;
} | null> {
  const userId = await getUserId(ctx);
  if (userId === null) return null;
  const event = await ctx.db.get("events", eventId);
  if (event === null) return null;
  if (event.ownerId === userId) return { userId, event, role: "owner" };
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_event_and_user", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .unique();
  if (session === null || session.revokedAt !== undefined) return null;
  return { userId, event, role: session.role };
}

export async function requireEventAccess(
  ctx: Ctx,
  eventId: Id<"events">,
  min: EventRole,
) {
  const access = await getEventAccess(ctx, eventId);
  // Same error for "missing" and "forbidden" so ids can't be probed.
  if (access === null || RANK[access.role] < RANK[min]) {
    throw new Error("Event not found");
  }
  return access;
}
