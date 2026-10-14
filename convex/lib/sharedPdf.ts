import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Whether this upload is the journal's locked PDF, the one its share link
// offers. Apart from pdf.ts so media.ts and share.ts can ask without an
// import cycle.
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
