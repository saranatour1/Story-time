import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import schema from "./schema";

const vChange = v.object({
  _id: v.id("changes"),
  _creationTime: v.number(),
  ...schema.tables.changes.validator.fields,
});

// Activity feed, newest first. Owner only; a revoked session sees nothing.
export const listForEvent = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vChange),
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    return await ctx.db
      .query("changes")
      .withIndex("by_event_and_at", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
