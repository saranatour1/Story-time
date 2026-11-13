import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Infer, ObjectType } from "convex/values";
import { mutation, query } from "../_generated/server";
import { MOMENT_LIMIT, momentsToRead } from "../lib/limits";
import {
  assertNotArchived,
  denyAsNotFound,
  getEventAccessFor,
  mayChangeMoment,
  type Reader,
  requireEventAccess,
  seesAllOf,
} from "../lib/access";
import { changeFields, lastEditOf, type Actor } from "../lib/actors";
import {
  checkOffset,
  encodeBlocks,
  encodeGeo,
  encodeLabels,
  encodePlace,
  encodeStops,
  invalid,
  mediaIdsOf,
} from "../lib/blocks";
import { vGeo, vTransport } from "../schema";
import { recordChange } from "../lib/changes";
import { decryptGeo, decryptText } from "../lib/crypto";
import { monthDayOf } from "../lib/monthDay";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const vPlainBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media"), hidden: v.optional(v.boolean()) }),
  v.object({ type: v.literal("video"), mediaId: v.id("media"), hidden: v.optional(v.boolean()) }),
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

export const vPlainStop = v.object({
  startsAt: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  transport: v.optional(vTransport),
  blocks: v.array(vPlainBlock),
});
export type PlainStop = Infer<typeof vPlainStop>;

export const vMomentView = v.object({
  _id: v.id("moments"),
  authorId: v.id("users"),
  authorName: v.optional(v.string()),
  authorAgent: v.optional(v.string()),
  editedAt: v.optional(v.number()),
  editedById: v.optional(v.id("users")),
  editedByName: v.optional(v.string()),
  editedByAgent: v.optional(v.string()),
  startsAt: v.number(),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  blocks: v.array(vPlainBlock),
  transport: v.optional(vTransport),
  stops: v.array(vPlainStop),
  labels: v.array(v.string()),
  people: v.array(v.object({ userId: v.id("users"), name: v.optional(v.string()) })),
  // Only ever true, and only for a reader the moment holds nothing back from.
  archived: v.optional(v.boolean()),
});
type MomentView = Infer<typeof vMomentView>;

const viewBlocks = async (
  event: Doc<"events">,
  encrypted: Doc<"moments">["blocks"],
): Promise<PlainBlock[]> => {
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
};

export const viewMoment = async (
  ctx: QueryCtx,
  event: Doc<"events">,
  moment: Doc<"moments">,
): Promise<Infer<typeof vMomentView>> => {
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
    people: await Promise.all(
      (moment.people ?? []).map(async (userId) => ({
        userId,
        name: (await ctx.db.get("users", userId))?.displayName,
      })),
    ),
    archived: moment.archived,
  };
};

// The moment as a reader gets it. Someone it holds nothing back from gets it
// whole. Anyone else gets it without its hidden photos and videos, and not at
// all when it is archived or nothing of it is left to show.
export const momentFor = (view: MomentView, seesAll: boolean): MomentView | null => {
  if (seesAll) return view;
  if (view.archived === true) return null;
  const shown = (blocks: PlainBlock[]) =>
    blocks.filter((b) => !((b.type === "photo" || b.type === "video") && b.hidden === true));
  const blocks = shown(view.blocks);
  const stops = view.stops.map((stop) => ({ ...stop, blocks: shown(stop.blocks) }));
  if (blocks.length + stops.reduce((n, stop) => n + stop.blocks.length, 0) === 0) return null;
  return { ...view, blocks, stops };
};

const momentCreate = {
  eventId: v.id("events"),
  startsAt: v.number(),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  blocks: v.array(vPlainBlock),
  transport: v.optional(vTransport),
  stops: v.optional(v.array(vPlainStop)),
  labels: v.optional(v.array(v.string())),
};
export type MomentCreate = ObjectType<typeof momentCreate>;

const create = mutation({
  args: momentCreate,
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "contributor");
    return createMoment(ctx, { userId, actor: { kind: "human", userId }, input: args });
  },
});

export const createMoment = async (
  ctx: MutationCtx,
  args: { userId: Id<"users">; actor: Actor; input: MomentCreate },
): Promise<Id<"moments">> => {
  const { userId, actor, input } = args;
  const event = await ctx.db.get("events", input.eventId);
  if (event === null) denyAsNotFound();
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

  await recordChange(ctx, {
    eventId: event._id,
    entity: "moment",
    entityId: momentId,
    ...changeFields(actor),
    action: "create",
    fields: ["startsAt", "place", "geo", "blocks", "transport", "stops", "labels"],
    after: {
      startsAt: input.startsAt,
      blockCount: blocks.length,
      stopCount: rest.stops.length + 1,
    },
  });
  return momentId;
};

// Every moment of the experience this reader may see, as they may see it.
export const listForEvent = async (
  ctx: QueryCtx,
  event: Doc<"events">,
  reader: Reader,
): Promise<MomentView[]> => {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  const views = await Promise.all(
    moments.map(async (m) => momentFor(await viewMoment(ctx, event, m), seesAllOf(reader, m))),
  );
  return views.filter((view) => view !== null);
};

const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, ...reader } = await requireEventAccess(ctx, args.eventId, "viewer");
    return listForEvent(ctx, event, reader);
  },
});

const page = query({
  args: {
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
    newestFirst: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { event, ...reader } = await requireEventAccess(ctx, args.eventId, "viewer");
    const result = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .order(args.newestFirst === true ? "desc" : "asc")
      .paginate(args.paginationOpts);
    const views = await Promise.all(
      result.page.map(async (m) =>
        momentFor(await viewMoment(ctx, event, m), seesAllOf(reader, m)),
      ),
    );
    // A page may come back short: the moments kept from this reader are in it.
    return { ...result, page: views.filter((view) => view !== null) };
  },
});

const momentEdit = {
  startsAt: v.optional(v.number()),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  blocks: v.optional(v.array(vPlainBlock)),
  transport: v.optional(v.union(vTransport, v.null())),
  stops: v.optional(v.array(vPlainStop)),
  labels: v.optional(v.array(v.string())),
  people: v.optional(v.array(v.id("users"))),
};
export type MomentEdit = ObjectType<typeof momentEdit>;

const update = mutation({
  args: { momentId: v.id("moments"), ...momentEdit },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(ctx, moment.eventId, "contributor");
    if (!mayChangeMoment(moment, userId, role)) {
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

const detachMedia = async (ctx: MutationCtx, mediaId: Id<"media">, userId: Id<"users">) => {
  const media = await ctx.db.get("media", mediaId);
  await ctx.db.patch("media", mediaId, {
    momentId: undefined,
    detachedBy: media?.uploaderId === userId ? userId : undefined,
  });
};

export const writeMomentUpdate = async (
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    moment: Doc<"moments">;
    userId: Id<"users">;
    actor: Actor;
    patch: MomentEdit;
  },
): Promise<{ removedMediaIds: Id<"media">[] }> => {
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
      | "people"
      | "lastEdit"
    >
  > = {};
  const fields: string[] = [];
  let removedMediaIds: Id<"media">[] = [];
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

  if (patch.people !== undefined) {
    const people = [...new Set(patch.people)];
    if (people.length > 50) invalid("people", "Add at most 50 people");
    for (const person of people) {
      if ((await getEventAccessFor(ctx, person, event._id)) === null) {
        invalid("people", "Only people on this experience can be added");
      }
    }
    docPatch.people = people.length > 0 ? people : undefined;
    fields.push("people");
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
  if (fields.length > 0) docPatch.lastEdit = lastEditOf(actor, Date.now());
  await ctx.db.patch("moments", moment._id, docPatch);

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
};

const remove = mutation({
  args: { momentId: v.id("moments") },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(ctx, moment.eventId, "contributor");
    if (!mayChangeMoment(moment, userId, role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own moments",
      });
    }
    assertNotArchived(event);
    return deleteMoment(ctx, { event, moment, userId });
  },
});

// Archive a moment, or bring it back. Archived, it is out of the story and
// kept from everyone but the experience's owners and its author. Whoever may
// edit the moment may archive it.
const setArchived = mutation({
  args: { momentId: v.id("moments"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(ctx, moment.eventId, "contributor");
    if (!mayChangeMoment(moment, userId, role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only archive your own moments",
      });
    }
    assertNotArchived(event);
    await archiveMoment(ctx, {
      event,
      moment,
      actor: { kind: "human", userId },
      archived: args.archived,
    });
    return null;
  },
});

// The caller has checked the person may change the moment.
export const archiveMoment = async (
  ctx: MutationCtx,
  args: { event: Doc<"events">; moment: Doc<"moments">; actor: Actor; archived: boolean },
): Promise<void> => {
  const { event, moment, actor, archived } = args;
  if ((moment.archived === true) === archived) return;
  await ctx.db.patch("moments", moment._id, { archived: archived ? true : undefined });
  await ctx.db.patch("events", event._id, {
    archivedCount: Math.max(0, (event.archivedCount ?? 0) + (archived ? 1 : -1)),
  });
  await recordChange(ctx, {
    eventId: event._id,
    entity: "moment",
    entityId: moment._id,
    ...changeFields(actor),
    action: "update",
    fields: ["archived"],
  });
};

export const deleteMoment = async (
  ctx: MutationCtx,
  args: { event: Doc<"events">; moment: Doc<"moments">; userId: Id<"users"> },
): Promise<{ removedMediaIds: Id<"media">[] }> => {
  const { event, moment, userId } = args;
  const removedMediaIds = mediaIdsOf(moment);
  for (const id of removedMediaIds) {
    await detachMedia(ctx, id, userId);
  }
  await ctx.db.delete("moments", moment._id);
  await ctx.db.patch("events", event._id, {
    momentCount: Math.max(0, event.momentCount - 1),
    // Spread, not `undefined`: a patch with undefined would clear the count.
    ...(moment.archived === true && {
      archivedCount: Math.max(0, (event.archivedCount ?? 0) - 1),
    }),
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
};

export const momentsApi = { create, list, page, update, remove, setArchived };
