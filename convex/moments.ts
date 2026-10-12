import { ConvexError, v } from "convex/values";
import type { Infer, ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { MOMENT_LIMIT, momentsToRead } from "./lib/limits";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { changeFields, lastEditOf, type Actor } from "./lib/actors";
import {
  checkOffset,
  encodeBlocks,
  encodeGeo,
  encodeLabels,
  encodePlace,
  encodeStops,
  invalid,
  mediaIdsOf,
} from "./lib/blocks";
import { vGeo, vTransport } from "./schema";
import { recordChange } from "./lib/changes";
import { datesBefore } from "./lib/cover";
import { decryptGeo, decryptText } from "./lib/crypto";
import { monthDayOf } from "./lib/monthDay";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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
  // Where the place is on the map; only with a place.
  geo: v.optional(vGeo),
  transport: v.optional(vTransport),
  blocks: v.array(vPlainBlock),
});
export type PlainStop = Infer<typeof vPlainStop>;

export const vMomentView = v.object({
  _id: v.id("moments"),
  authorId: v.id("users"),
  // The author's display name, if they set one. Nothing else from their profile.
  authorName: v.optional(v.string()),
  // Set when an agent added the moment for `authorId`: the agent's name.
  authorAgent: v.optional(v.string()),
  // Present once the moment has been edited: when, by which person (for an
  // agent's edit, the person it acts for) and by which agent, if one did.
  editedAt: v.optional(v.number()),
  // The person's id (an agent's edit: the one it acts for; Scribe's: none), so
  // someone with no display name is still known to be a person.
  editedById: v.optional(v.id("users")),
  editedByName: v.optional(v.string()),
  editedByAgent: v.optional(v.string()),
  startsAt: v.number(),
  // Minutes east of UTC where it happened, so its times read in that zone.
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
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
  const edit = moment.lastEdit;
  const editor =
    edit?.userId === undefined
      ? null
      : edit.userId === moment.authorId
        ? author
        : await ctx.db.get("users", edit.userId);
  return {
    _id: moment._id,
    authorId: moment.authorId,
    authorName: author?.displayName,
    authorAgent: moment.authorAgent,
    editedAt: edit?.at,
    editedById: edit?.userId,
    editedByName: editor?.displayName,
    editedByAgent: edit?.agent,
    startsAt: moment.startsAt,
    tzOffsetMinutes: moment.tzOffsetMinutes,
    place: moment.place ? await decryptText(event._id, moment.place) : undefined,
    geo: moment.geo ? await decryptGeo(event._id, moment.geo) : undefined,
    blocks: await viewBlocks(event, moment.blocks),
    transport: moment.transport,
    stops: await Promise.all(
      (moment.stops ?? []).map(async (s) => ({
        startsAt: s.startsAt,
        place: s.place ? await decryptText(event._id, s.place) : undefined,
        geo: s.geo ? await decryptGeo(event._id, s.geo) : undefined,
        transport: s.transport,
        blocks: await viewBlocks(event, s.blocks),
      })),
    ),
    labels: await Promise.all((moment.labels ?? []).map((l) => decryptText(event._id, l))),
  };
}

// What a new moment takes. `create` takes these as they are; an agent adds
// a moment through the same write.
const momentCreate = {
  eventId: v.id("events"),
  startsAt: v.number(),
  // Minutes east of UTC for the author's local day/month grouping.
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  // Where the place is on the map; only with a place.
  geo: v.optional(vGeo),
  blocks: v.array(vPlainBlock),
  transport: v.optional(vTransport),
  stops: v.optional(v.array(vPlainStop)),
  labels: v.optional(v.array(v.string())),
};
export type MomentCreate = ObjectType<typeof momentCreate>;

export const create = mutation({
  args: momentCreate,
  returns: v.id("moments"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "contributor");
    return createMoment(ctx, { event, userId, actor: { kind: "human", userId }, input: args });
  },
});

// The write behind `create`, shared with agents. Access stays with the
// caller; this checks the experience takes more moments and that the content
// is valid. `userId` is the author: for an agent, the person it acts for.
export async function createMoment(
  ctx: MutationCtx,
  args: { event: Doc<"events">; userId: Id<"users">; actor: Actor; input: MomentCreate },
): Promise<Id<"moments">> {
  const { event, userId, actor, input } = args;
  assertNotArchived(event);
  if (event.momentCount >= MOMENT_LIMIT) {
    throw new ConvexError({
      code: "MOMENT_LIMIT",
      message: `This experience holds up to ${MOMENT_LIMIT} moments.`,
      limit: MOMENT_LIMIT,
    });
  }
  if (!Number.isFinite(input.startsAt)) invalid("startsAt", "Pick a date");
  const tzOffsetMinutes = checkOffset(input.tzOffsetMinutes);

  const first = await encodeBlocks(ctx, {
    event,
    userId,
    blocks: input.blocks,
    allowEmpty: true,
  });
  const rest = await encodeStops(ctx, { event, userId, stops: input.stops ?? [] });
  if (first.blocks.length + rest.stops.reduce((n, s) => n + s.blocks.length, 0) === 0) {
    invalid("blocks", "Add something to share");
  }
  const blocks = first.blocks;
  const mediaIds = [...first.mediaIds, ...rest.mediaIds];
  const place = await encodePlace(event, input.place);
  const geo = await encodeGeo(event, input.geo, {
    field: "geo",
    hasPlace: place !== undefined,
  });
  const labels = await encodeLabels(event, input.labels ?? []);
  // A dateless trip's cover runs from its first moment to its last.
  const followCover = await datesBefore(ctx, event);

  const momentId = await ctx.db.insert("moments", {
    eventId: event._id,
    authorId: userId,
    authorAgent: actor.kind === "agent" ? actor.name : undefined,
    startsAt: input.startsAt,
    tzOffsetMinutes,
    monthDay: monthDayOf(input.startsAt, tzOffsetMinutes),
    place,
    geo,
    blocks,
    transport: input.transport,
    stops: rest.stops.length > 0 ? rest.stops : undefined,
    labels: labels.length > 0 ? labels : undefined,
  });
  for (const mediaId of mediaIds) {
    await ctx.db.patch("media", mediaId, { momentId });
  }

  await ctx.db.patch("events", event._id, {
    momentCount: event.momentCount + 1,
    status: event.status === "draft" ? "active" : event.status,
  });
  await followCover(ctx);

  await recordChange(ctx, {
    eventId: event._id,
    entity: "moment",
    entityId: momentId,
    ...changeFields(actor),
    action: "create",
    fields: ["startsAt", "place", "geo", "blocks", "transport", "stops", "labels"],
    after: { startsAt: input.startsAt, blockCount: blocks.length, stopCount: rest.stops.length + 1 },
  });
  // The page is a later batch, not part of this write: a long import of photos
  // must not decrypt and insert the whole book in one transaction.
  await ctx.scheduler.runAfter(0, internal.journal.makePages, { eventId: event._id });
  return momentId;
}

export async function listForEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Array<Infer<typeof vMomentView>>> {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
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

// What an edit can change. `update` takes these with the moment's id; the AI
// enrichment passes the same shape to `writeMomentUpdate`.
const momentEdit = {
  startsAt: v.optional(v.number()),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  blocks: v.optional(v.array(vPlainBlock)),
  // null clears it.
  transport: v.optional(v.union(vTransport, v.null())),
  // Replace the whole list when passed.
  stops: v.optional(v.array(vPlainStop)),
  labels: v.optional(v.array(v.string())),
};
export type MomentEdit = ObjectType<typeof momentEdit>;

// Edit a moment. Only fields that are passed change; "" clears the place.
// `geo` travels with `place`: it's ignored without one, and a place passed
// without it clears the old coordinates.
// Returns photos dropped from the moment so the caller can delete them from
// R2 (they are detached here; Convex can't reach R2).
export const update = mutation({
  args: { momentId: v.id("moments"), ...momentEdit },
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
    return writeMomentUpdate(ctx, {
      event,
      moment,
      userId,
      actor: { kind: "human", userId },
      patch: args,
    });
  },
});

// Takes a photo off a moment. Its uploader may delete it afterwards, so they're
// recorded as the detacher. Anyone else's photo stays for its uploader and the
// experience owner to delete: someone who merely edits a moment gets no rights.
async function detachMedia(ctx: MutationCtx, mediaId: Id<"media">, userId: Id<"users">) {
  const media = await ctx.db.get("media", mediaId);
  await ctx.db.patch("media", mediaId, {
    momentId: undefined,
    detachedBy: media?.uploaderId === userId ? userId : undefined,
  });
}

// The write behind `update`, shared with the AI enrichment and with agents.
// Encodes the edit, moves media on and off the moment, keeps the itinerary in
// step, notes who edited and logs the change. Access checks stay with the caller.
export async function writeMomentUpdate(
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    moment: Doc<"moments">;
    // Whose uploads may be attached: the editor's own.
    userId: Id<"users">;
    // Who the change log and the moment name as the editor.
    actor: Actor;
    patch: MomentEdit;
  },
): Promise<{ removedMediaIds: Id<"media">[] }> {
  const { event, moment, userId, actor, patch } = args;

  const docPatch: Partial<
    Pick<
      Doc<"moments">,
      | "startsAt"
      | "tzOffsetMinutes"
      | "monthDay"
      | "place"
      | "geo"
      | "blocks"
      | "transport"
      | "stops"
      | "labels"
      | "lastEdit"
    >
  > = {};
  const fields: string[] = [];
  let removedMediaIds: Id<"media">[] = [];
  // Not a field the change log names, so an offset on its own is stored quietly.
  const tzOffsetMinutes = checkOffset(patch.tzOffsetMinutes);
  if (tzOffsetMinutes !== undefined) docPatch.tzOffsetMinutes = tzOffsetMinutes;

  if (patch.startsAt !== undefined) {
    if (!Number.isFinite(patch.startsAt)) invalid("startsAt", "Pick a date");
    if (patch.startsAt !== moment.startsAt) {
      docPatch.startsAt = patch.startsAt;
      fields.push("startsAt");
    }
  }

  if (patch.startsAt !== undefined || tzOffsetMinutes !== undefined) {
    const nextStarts = docPatch.startsAt ?? moment.startsAt;
    const nextOffset = tzOffsetMinutes !== undefined ? tzOffsetMinutes : moment.tzOffsetMinutes;
    docPatch.monthDay = monthDayOf(nextStarts, nextOffset);
  }

  if (patch.place !== undefined) {
    docPatch.place = await encodePlace(event, patch.place);
    fields.push("place");
    docPatch.geo = await encodeGeo(event, patch.geo, {
      field: "geo",
      hasPlace: docPatch.place !== undefined,
    });
    if (docPatch.geo !== undefined || moment.geo !== undefined) fields.push("geo");
  }

  if (patch.transport !== undefined) {
    docPatch.transport = patch.transport ?? undefined;
    fields.push("transport");
  }

  if (patch.labels !== undefined) {
    const labels = await encodeLabels(event, patch.labels);
    docPatch.labels = labels.length > 0 ? labels : undefined;
    fields.push("labels");
  }

  if (patch.blocks !== undefined || patch.stops !== undefined) {
    if (patch.blocks !== undefined) {
      const encoded = await encodeBlocks(ctx, {
        event,
        userId,
        blocks: patch.blocks,
        momentId: moment._id,
        allowEmpty: true,
      });
      docPatch.blocks = encoded.blocks;
      fields.push("blocks");
    }
    if (patch.stops !== undefined) {
      const encoded = await encodeStops(ctx, {
        event,
        userId,
        stops: patch.stops,
        momentId: moment._id,
      });
      docPatch.stops = encoded.stops.length > 0 ? encoded.stops : undefined;
      fields.push("stops");
    }
    const after = {
      blocks: docPatch.blocks ?? moment.blocks,
      stops: "stops" in docPatch ? docPatch.stops : moment.stops,
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
      await detachMedia(ctx, id, userId);
    }
    for (const id of kept) {
      if (!before.includes(id)) {
        await ctx.db.patch("media", id, { momentId: moment._id });
      }
    }
  }

  if (fields.length === 0 && tzOffsetMinutes === undefined) return { removedMediaIds: [] };
  // Only a real field change counts as an edit: an offset alone leaves no "edited" mark.
  if (fields.length > 0) docPatch.lastEdit = lastEditOf(actor, Date.now());
  const followCover = docPatch.startsAt !== undefined ? await datesBefore(ctx, event) : undefined;
  await ctx.db.patch("moments", moment._id, docPatch);
  await followCover?.(ctx);

  // The log keeps naming only the fields people changed.
  if (fields.length === 0) return { removedMediaIds };
  await recordChange(ctx, {
    eventId: event._id,
    entity: "moment",
    entityId: moment._id,
    ...changeFields(actor),
    action: "update",
    fields,
    after: docPatch.startsAt !== undefined ? { startsAt: docPatch.startsAt } : undefined,
  });
  return { removedMediaIds };
}

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
    return deleteMoment(ctx, { event, moment, userId });
  },
});

// The write behind `remove`, shared with typed requests. Detaches the moment's
// photos (returned, so the caller can clear them from R2) and logs the change. Access checks stay with the caller.
export async function deleteMoment(
  ctx: MutationCtx,
  args: { event: Doc<"events">; moment: Doc<"moments">; userId: Id<"users"> },
): Promise<{ removedMediaIds: Id<"media">[] }> {
  const { event, moment, userId } = args;
  const removedMediaIds = mediaIdsOf(moment);
  for (const id of removedMediaIds) {
    await detachMedia(ctx, id, userId);
  }
  const followCover = await datesBefore(ctx, event);
  await ctx.db.delete("moments", moment._id);
  await ctx.db.patch("events", event._id, {
    momentCount: Math.max(0, event.momentCount - 1),
  });
  await followCover(ctx);

  await recordChange(ctx, {
    eventId: event._id,
    entity: "moment",
    entityId: moment._id,
    actorId: userId,
    action: "delete",
    fields: [],
  });
  return { removedMediaIds };
}
