import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import { viewMoment, vMomentView } from "./moments";

const vGroupBy = v.union(
  v.literal("day"),
  v.literal("month"),
  v.literal("place"),
);

// Moments grouped by day, month or place. Rows come back ordered by the
// grouping index, then each group is built in one pass.
export const grouped = query({
  args: { eventId: v.id("events"), groupBy: vGroupBy },
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      moments: v.array(vMomentView),
    }),
  ),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const q = ctx.db.query("itinerary");
    const rows =
      args.groupBy === "day"
        ? await q
            .withIndex("by_event_and_day", (i) => i.eq("eventId", args.eventId))
            .take(500)
        : args.groupBy === "month"
          ? await q
              .withIndex("by_event_and_month", (i) =>
                i.eq("eventId", args.eventId),
              )
              .take(500)
          : await q
              .withIndex("by_event_and_place", (i) =>
                i.eq("eventId", args.eventId),
              )
              .take(500);

    const groups = new Map<
      string,
      { label: string; moments: Awaited<ReturnType<typeof viewMoment>>[] }
    >();
    for (const row of rows) {
      const moment = await ctx.db.get("moments", row.momentId);
      if (moment === null) continue;
      const view = await viewMoment(ctx, event, moment);
      const key =
        args.groupBy === "day"
          ? row.dayKey
          : args.groupBy === "month"
            ? row.monthKey
            : (row.placeKey ?? "none");
      const label =
        args.groupBy === "place" ? (view.place ?? "No place") : key;
      const group = groups.get(key) ?? { label, moments: [] };
      group.moments.push(view);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, g]) => ({
      key,
      label: g.label,
      moments: g.moments.sort((a, b) => a.startsAt - b.startsAt),
    }));
  },
});
