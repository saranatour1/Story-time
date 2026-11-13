import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const isSharedPdf = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  mediaId: Id<"media">,
): Promise<boolean> => {
  const journal = await ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
  return journal?.pdf?.mediaId === mediaId;
};
