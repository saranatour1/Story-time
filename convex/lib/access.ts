import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
export type EventRole = "owner" | "contributor" | "viewer";

const RANK: Record<EventRole, number> = { viewer: 0, contributor: 1, owner: 2 };

export const getUserId = async (ctx: Ctx): Promise<Id<"users"> | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  const userId = ctx.db.normalizeId("users", identity.subject);
  return userId === null || (await isBlocked(ctx, userId)) ? null : userId;
};

export const isBlocked = async (ctx: Ctx, userId: Id<"users">): Promise<boolean> => {
  return (await ctx.db.get("users", userId))?.blockedAt !== undefined;
};

export const requireUserId = async (ctx: Ctx): Promise<Id<"users">> => {
  const userId = await getUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
};

export const getEventAccessFor = async (
  ctx: Ctx,
  userId: Id<"users">,
  eventId: Id<"events">,
): Promise<{
  userId: Id<"users">;
  event: Doc<"events">;
  role: EventRole;
} | null> => {
  const event = await ctx.db.get("events", eventId);
  if (event === null) return null;
  if (event.ownerId === userId) return { userId, event, role: "owner" };
  if (await isBlocked(ctx, event.ownerId)) return null;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId).eq("userId", userId))
    .unique();
  if (session === null || session.revokedAt !== undefined) return null;
  return { userId, event, role: session.role };
};

export const getEventAccess = async (ctx: Ctx, eventId: Id<"events">) => {
  const userId = await getUserId(ctx);
  if (userId === null) return null;
  return getEventAccessFor(ctx, userId, eventId);
};

export const denyAsNotFound: () => never = () => {
  throw new Error("Event not found");
};

const allowOrNotFound = <T extends { role: EventRole }>(access: T | null, min: EventRole): T => {
  if (access === null || RANK[access.role] < RANK[min]) denyAsNotFound();
  return access;
};

export const requireEventAccessFor = async (
  ctx: Ctx,
  userId: Id<"users">,
  eventId: Id<"events">,
  min: EventRole,
) => {
  return allowOrNotFound(await getEventAccessFor(ctx, userId, eventId), min);
};

export const requireEventAccess = async (ctx: Ctx, eventId: Id<"events">, min: EventRole) => {
  return allowOrNotFound(await getEventAccess(ctx, eventId), min);
};

export const mayChangeMoment = (
  moment: { authorId: Id<"users"> },
  userId: Id<"users">,
  role: EventRole,
): boolean => role === "owner" || moment.authorId === userId;

export const assertNotArchived = (event: Doc<"events">) => {
  if (event.status === "archived") {
    throw new ConvexError({
      code: "ARCHIVED",
      message: "This experience is archived and no longer accepts changes.",
    });
  }
};

export const sharesExperience = async (
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> => {
  const reachable = async (user: Id<"users">) => {
    const ids = new Set<Id<"events">>();
    const owned = await ctx.db
      .query("events")
      .withIndex("by_owner", (q) => q.eq("ownerId", user))
      .take(100);
    for (const e of owned) ids.add(e._id);
    const grants = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user))
      .take(100);
    for (const g of grants) if (g.revokedAt === undefined) ids.add(g.eventId);
    return ids;
  };
  const [mine, theirs] = await Promise.all([reachable(a), reachable(b)]);
  for (const id of mine) if (theirs.has(id)) return true;
  return false;
};
