import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireEventAccess } from "../lib/access";
import { changeCounts } from "../lib/aggregates";

const NOTABLE = ["moment", "page", "guestNote"] as const;

const UNREAD_SCAN = 1000;

const countCreates = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  entity: (typeof NOTABLE)[number],
  since: number,
): Promise<number> => {
  const rows = await ctx.db
    .query("changes")
    .withIndex("by_event_entity_action_at", (q) =>
      q.eq("eventId", eventId).eq("entity", entity).eq("action", "create").gt("at", since),
    )
    .take(UNREAD_SCAN);
  return rows.length;
};

const unreadCount = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return 0;
    const { userId } = await requireEventAccess(ctx, eventId, "owner");
    const read = await ctx.db
      .query("activityReads")
      .withIndex("by_user_and_event", (q) => q.eq("userId", userId).eq("eventId", eventId))
      .unique();
    const since = read?.readAt ?? 0;
    let total = 0;
    for (const entity of NOTABLE) total += await countCreates(ctx, eventId, entity, since);
    return total;
  },
});

const markRead = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "owner");
    const read = await ctx.db
      .query("activityReads")
      .withIndex("by_user_and_event", (q) => q.eq("userId", userId).eq("eventId", args.eventId))
      .unique();
    const readAt = Date.now();
    if (read === null) {
      await ctx.db.insert("activityReads", { userId, eventId: args.eventId, readAt });
    } else {
      await ctx.db.patch("activityReads", read._id, { readAt });
    }
    return null;
  },
});

const listForEvent = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const page = await ctx.db
      .query("changes")
      .withIndex("by_event_and_at", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);

    const ids = new Set(page.page.flatMap((c) => (c.actorId === undefined ? [] : [c.actorId])));
    const names = new Map<Id<"users">, string | undefined>(
      await Promise.all(
        [...ids].map(async (id) => [id, (await ctx.db.get("users", id))?.displayName] as const),
      ),
    );
    return {
      ...page,
      page: page.page.map((c) => ({
        ...c,
        actorName: c.actorId === undefined ? undefined : names.get(c.actorId),
      })),
    };
  },
});

const counts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const namespace = args.eventId;
    const everyone = await changeCounts.count(ctx, { namespace });
    const people = await changeCounts.count(ctx, { namespace, bounds: { eq: "people" } });
    const agents = await changeCounts.count(ctx, { namespace, bounds: { eq: "agents" } });
    return { everyone, people, agents, system: everyone - people - agents };
  },
});

export const changesApi = { unreadCount, markRead, listForEvent, counts };
