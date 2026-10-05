import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import {
  encodeBlocks,
  encodeLabels,
  encodePlace,
  encodeStops,
  invalid,
  localKeys,
  mediaIdsOf,
} from "./lib/blocks";
import { vTransport } from "./schema";
import { recordChange } from "./lib/changes";
import { decryptText } from "./lib/crypto";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// The decrypted shape clients send and receive.
export const vPlainBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media") }),
  v.object({ type: v.literal("video"), mediaId: v.id("media") }),
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

// A stop after the first, as clients send and receive it.
export const vPlainStop = v.object({
  startsAt: v.optional(v.number()),
  place: v.optional(v.string()),
  transport: v.optional(vTransport),
  blocks: v.array(vPlainBlock),
});
export type PlainStop = Infer<typeof vPlainStop>;

export const vMomentView = v.object({
  _id: v.id("moments"),
  authorId: v.id("users"),
  // The author's display name, if they set one. Nothing else from their profile.
  authorName: v.optional(v.string()),
  startsAt: v.number(),
  place: v.optional(v.string()),
  blocks: v.array(vPlainBlock),
  // How they got to the first stop; `stops` are the ones after it.
  transport: v.optional(vTransport),
  stops: v.array(vPlainStop),
  labels: v.array(v.string()),
});

async function viewBlocks(event: Doc<"events">, encrypted: Doc<"moments">["blocks"]): Promise<PlainBlock[]> {
  const blocks: PlainBlock[] = [];
  for (const b of encrypted) {
    if (b.type === "photo" || b.type === "video") blocks.push(b);
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
  return blocks;
}

export async function viewMoment(
  ctx: QueryCtx,
  event: Doc<"events">,
  moment: Doc<"moments">,
): Promise<Infer<typeof vMomentView>> {
  const author = await ctx.db.get("users", moment.authorId);
  return {
    _id: moment._id,
    authorId: moment.authorId,
    authorName: author?.displayName,
    startsAt: moment.startsAt,
    place: moment.place ? await decryptText(event._id, moment.place) : undefined,
    blocks: await viewBlocks(event, moment.blocks),
    transport: moment.transport,
    stops: await Promise.all(
      (moment.stops ?? []).map(async (s) => ({
        startsAt: s.startsAt,
        place: s.place ? await decryptText(event._id, s.place) : undefined,
        transport: s.transport,
        blocks: await viewBlocks(event, s.blocks),
      })),
    ),
    labels: await Promise.all((moment.labels ?? []).map((l) => decryptText(event._id, l))),
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
    transport: v.optional(vTransport),
    stops: v.optional(v.array(vPlainStop)),
    labels: v.optional(v.array(v.string())),
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

    const first = await encodeBlocks(ctx, {
      event,
      userId,
      blocks: args.blocks,
      allowEmpty: true,
    });
    const rest = await encodeStops(ctx, { event, userId, stops: args.stops ?? [] });
    if (first.blocks.length + rest.stops.reduce((n, s) => n + s.blocks.length, 0) === 0) {
      invalid("blocks", "Add something to share");
    }
    const blocks = first.blocks;
    const mediaIds = [...first.mediaIds, ...rest.mediaIds];
    const { place, placeKey } = await encodePlace(event, args.place);
    const labels = await encodeLabels(event, args.labels ?? []);

    const momentId = await ctx.db.insert("moments", {
      eventId: args.eventId,
      authorId: userId,
      startsAt: args.startsAt,
      place,
      blocks,
      transport: args.transport,
      stops: rest.stops.length > 0 ? rest.stops : undefined,
      labels: labels.length > 0 ? labels : undefined,
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
      fields: ["startsAt", "place", "blocks", "transport", "stops", "labels"],
      after: { startsAt: args.startsAt, blockCount: blocks.length, stopCount: rest.stops.length + 1 },
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
  return Promise.all(moments.map((m) => viewMoment(ctx, event, m)));
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
    // null clears it.
    transport: v.optional(v.union(vTransport, v.null())),
    // Replace the whole list when passed.
    stops: v.optional(v.array(vPlainStop)),
    labels: v.optional(v.array(v.string())),
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

    const patch: Partial<
      Pick<Doc<"moments">, "startsAt" | "place" | "blocks" | "transport" | "stops" | "labels">
    > = {};
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

    if (args.transport !== undefined) {
      patch.transport = args.transport ?? undefined;
      fields.push("transport");
    }

    if (args.labels !== undefined) {
      const labels = await encodeLabels(event, args.labels);
      patch.labels = labels.length > 0 ? labels : undefined;
      fields.push("labels");
    }

    if (args.blocks !== undefined || args.stops !== undefined) {
      if (args.blocks !== undefined) {
        const encoded = await encodeBlocks(ctx, {
          event,
          userId,
          blocks: args.blocks,
          momentId: moment._id,
          allowEmpty: true,
        });
        patch.blocks = encoded.blocks;
        fields.push("blocks");
      }
      if (args.stops !== undefined) {
        const encoded = await encodeStops(ctx, {
          event,
          userId,
          stops: args.stops,
          momentId: moment._id,
        });
        patch.stops = encoded.stops.length > 0 ? encoded.stops : undefined;
        fields.push("stops");
      }
      const after = {
        blocks: patch.blocks ?? moment.blocks,
        stops: "stops" in patch ? patch.stops : moment.stops,
      };
      if (after.blocks.length + (after.stops ?? []).reduce((n, s) => n + s.blocks.length, 0) === 0) {
        invalid("blocks", "Add something to share");
      }
      // Photos and videos dropped from any stop are detached and returned
      // for deletion; new ones are attached to this moment.
      const before = mediaIdsOf(moment);
      const kept = new Set(mediaIdsOf(after));
      removedMediaIds = before.filter((id) => !kept.has(id));
      for (const id of removedMediaIds) {
        await ctx.db.patch("media", id, { momentId: undefined });
      }
      for (const id of kept) {
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

// Delete a moment. Its photos are detached and returned so the caller can
// delete them from R2.
export const remove = mutation({
  args: { momentId: v.id("moments") },
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
        message: "You can only delete your own moments",
      });
    }
    assertNotArchived(event);

    const removedMediaIds = mediaIdsOf(moment);
    for (const id of removedMediaIds) {
      await ctx.db.patch("media", id, { momentId: undefined });
    }
    const row = await ctx.db
      .query("itinerary")
      .withIndex("by_moment", (q) => q.eq("momentId", moment._id))
      .unique();
    if (row !== null) await ctx.db.delete("itinerary", row._id);
    await ctx.db.delete("moments", moment._id);
    await ctx.db.patch("events", event._id, {
      momentCount: Math.max(0, event.momentCount - 1),
    });

    await recordChange(ctx, {
      eventId: event._id,
      entity: "moment",
      entityId: moment._id,
      actorId: userId,
      action: "delete",
      fields: [],
    });
    return { removedMediaIds };
  },
});
