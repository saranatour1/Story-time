import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { encodeBlocks, encodePlace, invalid, localKeys } from "./lib/blocks";
import { recordChange } from "./lib/changes";
import { decryptText } from "./lib/crypto";
import type { Doc, Id } from "./_generated/dataModel";
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

// Edit a moment. Only fields that are passed change; "" clears the place.
// Returns photos dropped from the moment so the caller can delete them from
// R2 (they are detached here; Convex can't reach R2).
export const update = mutation({
  args: {
    momentId: v.id("moments"),
    startsAt: v.optional(v.number()),
    tzOffsetMinutes: v.optional(v.number()),
    place: v.optional(v.string()),
    blocks: v.optional(v.array(vPlainBlock)),
  },
  returns: v.object({ removedMediaIds: v.array(v.id("media")) }),
  handler: async (ctx, args) => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(
      ctx,
      moment.eventId,
      "contributor",
    );
    if (role !== "owner" && moment.authorId !== userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only edit your own moments",
      });
    }
    assertNotArchived(event);

    const patch: Partial<Pick<Doc<"moments">, "startsAt" | "place" | "blocks">> = {};
    const fields: string[] = [];
    let placeKey: string | undefined | null = null; // null = unchanged
    let removedMediaIds: Id<"media">[] = [];

    if (args.startsAt !== undefined) {
      if (!Number.isFinite(args.startsAt)) invalid("startsAt", "Pick a date");
      if (args.startsAt !== moment.startsAt) {
        patch.startsAt = args.startsAt;
        fields.push("startsAt");
      }
    }

    if (args.place !== undefined) {
      const encoded = await encodePlace(event, args.place);
      patch.place = encoded.place;
      placeKey = encoded.placeKey;
      fields.push("place");
    }

    if (args.blocks !== undefined) {
      const encoded = await encodeBlocks(ctx, {
        event,
        userId,
        blocks: args.blocks,
        momentId: moment._id,
      });
      patch.blocks = encoded.blocks;
      fields.push("blocks");
      const before = moment.blocks.flatMap((b) => (b.type === "photo" ? [b.mediaId] : []));
      const kept = new Set(encoded.mediaIds);
      removedMediaIds = before.filter((id) => !kept.has(id));
      for (const id of removedMediaIds) {
        await ctx.db.patch("media", id, { momentId: undefined });
      }
      for (const id of encoded.mediaIds) {
        if (!before.includes(id)) {
          await ctx.db.patch("media", id, { momentId: moment._id });
        }
      }
    }

    if (fields.length === 0) return { removedMediaIds: [] };
    await ctx.db.patch("moments", moment._id, patch);

    // Keep the itinerary row in step with the moment.
    const row = await ctx.db
      .query("itinerary")
      .withIndex("by_moment", (q) => q.eq("momentId", moment._id))
      .unique();
    if (row !== null) {
      const rowPatch: Partial<
        Pick<Doc<"itinerary">, "startsAt" | "dayKey" | "monthKey" | "placeKey">
      > = {};
      if (patch.startsAt !== undefined || args.tzOffsetMinutes !== undefined) {
        const startsAt = patch.startsAt ?? moment.startsAt;
        Object.assign(rowPatch, {
          startsAt,
          ...localKeys(startsAt, args.tzOffsetMinutes ?? 0),
        });
      }
      if (placeKey !== null) rowPatch.placeKey = placeKey;
      if (Object.keys(rowPatch).length > 0) {
        await ctx.db.patch("itinerary", row._id, rowPatch);
      }
    }

    await recordChange(ctx, {
      eventId: event._id,
      entity: "moment",
      entityId: moment._id,
      actorId: userId,
      action: "update",
      fields,
      after: patch.startsAt !== undefined ? { startsAt: patch.startsAt } : undefined,
    });
    return { removedMediaIds };
  },
});
