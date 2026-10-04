import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { encodeBlocks, encodePlace, invalid, localKeys } from "./lib/blocks";
import { recordChange } from "./lib/changes";
import { decryptText } from "./lib/crypto";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// The decrypted shape clients send and receive.
export const vPlainBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media") }),
  v.object({
    type: v.literal("link"),
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({ type: v.literal("note"), text: v.string() }),
  v.object({
    type: v.literal("feeling"),
    text: v.string(),
    mood: v.optional(v.string()),
  }),
);
export type PlainBlock = Infer<typeof vPlainBlock>;

export const vMomentView = v.object({
  _id: v.id("moments"),
  authorId: v.id("users"),
  startsAt: v.number(),
  place: v.optional(v.string()),
  blocks: v.array(vPlainBlock),
});

export async function viewMoment(
  event: Doc<"events">,
  moment: Doc<"moments">,
): Promise<Infer<typeof vMomentView>> {
  const blocks: PlainBlock[] = [];
  for (const b of moment.blocks) {
    if (b.type === "photo") blocks.push(b);
    else if (b.type === "link") {
      blocks.push({
        type: "link",
        url: await decryptText(event._id, b.url),
        title: b.title ? await decryptText(event._id, b.title) : undefined,
      });
    } else if (b.type === "note") {
      blocks.push({ type: "note", text: await decryptText(event._id, b.text) });
    } else {
      blocks.push({
        type: "feeling",
        text: await decryptText(event._id, b.text),
        mood: b.mood,
      });
    }
  }
  return {
    _id: moment._id,
    authorId: moment.authorId,
    startsAt: moment.startsAt,
    place: moment.place ? await decryptText(event._id, moment.place) : undefined,
    blocks,
  };
}

export const create = mutation({
  args: {
    eventId: v.id("events"),
    startsAt: v.number(),
    // Minutes east of UTC for the author's local day/month grouping.
    tzOffsetMinutes: v.optional(v.number()),
    place: v.optional(v.string()),
    blocks: v.array(vPlainBlock),
  },
  returns: v.id("moments"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "contributor",
    );

    assertNotArchived(event);
    if (event.momentCount >= event.momentLimit) {
      throw new ConvexError({
        code: "MOMENT_LIMIT",
        message: `This experience is limited to ${event.momentLimit} moments. Request more to add another.`,
        limit: event.momentLimit,
      });
    }
    if (!Number.isFinite(args.startsAt)) invalid("startsAt", "Pick a date");

    const { blocks, mediaIds } = await encodeBlocks(ctx, {
      event,
      userId,
      blocks: args.blocks,
    });
    const { place, placeKey } = await encodePlace(event, args.place);

    const momentId = await ctx.db.insert("moments", {
      eventId: args.eventId,
      authorId: userId,
      startsAt: args.startsAt,
      place,
      blocks,
    });
    for (const mediaId of mediaIds) {
      await ctx.db.patch("media", mediaId, { momentId });
    }

    await ctx.db.insert("itinerary", {
      eventId: args.eventId,
      momentId,
      startsAt: args.startsAt,
      ...localKeys(args.startsAt, args.tzOffsetMinutes ?? 0),
      placeKey,
      position: event.momentCount,
    });
    await ctx.db.patch("events", args.eventId, {
      momentCount: event.momentCount + 1,
      status: event.status === "draft" ? "active" : event.status,
    });

    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "moment",
      entityId: momentId,
      actorId: userId,
      action: "create",
      fields: ["startsAt", "place", "blocks"],
      after: { startsAt: args.startsAt, blockCount: blocks.length },
    });
    return momentId;
  },
});

export async function listForEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Array<Infer<typeof vMomentView>>> {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(500);
  return Promise.all(moments.map((m) => viewMoment(event, m)));
}

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(vMomentView),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    return listForEvent(ctx, event);
  },
});
