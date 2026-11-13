import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  type EventRole,
} from "../lib/access";
import { changeFields, type Actor } from "../lib/actors";
import { changeCounts, eventMedia, uploadBytes } from "../lib/aggregates";
import { invalid } from "../lib/blocks";
import { recordChange } from "../lib/changes";
import { decryptGeo, encryptText, readText } from "../lib/crypto";
import { MAX_EVENTS_PER_USER } from "../lib/limits";

const vStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("archived"));
const vEditableVisibility = v.union(v.literal("private"), v.literal("invite"));

const SKETCH_MOMENTS = 12;
const SKETCH_POINTS = 40;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const sketchFor = async (ctx: QueryCtx, event: Doc<"events">) => {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(SKETCH_MOMENTS);
  const points: Array<{ lat: number; lng: number }> = [];
  for (const m of moments) {
    for (const enc of [m.geo, ...(m.stops ?? []).map((s) => s.geo)]) {
      if (enc === undefined || points.length >= SKETCH_POINTS) continue;
      const g = await decryptGeo(event._id, enc);
      if (g === undefined) continue;
      const p = { lat: round3(g.lat), lng: round3(g.lng) };
      const last = points.at(-1);
      if (!last || last.lat !== p.lat || last.lng !== p.lng) points.push(p);
    }
  }
  return points.length >= 2 ? points : undefined;
};

export const summaryOf = (event: Doc<"events">, role: EventRole) => {
  return {
    _id: event._id,
    _creationTime: event._creationTime,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    visibility: event.visibility,
    // The moments in the story: archived ones aren't counted.
    momentCount: event.momentCount - (event.archivedCount ?? 0),
    role,
  };
};

const toView = async (event: Doc<"events">, role: EventRole) => {
  return { ...summaryOf(event, role), description: await readText(event._id, event.description) };
};

// Guests see the cover too, so a hidden photo or an archived moment's never is one.
const coverFor = async (ctx: QueryCtx, event: Doc<"events">): Promise<Id<"media"> | undefined> => {
  if (event.coverMediaId !== undefined) return event.coverMediaId;
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(5);
  for (const moment of moments) {
    if (moment.archived === true) continue;
    for (const blocks of [moment.blocks, ...(moment.stops ?? []).map((s) => s.blocks)]) {
      for (const block of blocks) {
        if (block.type === "photo" && block.hidden !== true) return block.mediaId;
      }
    }
  }
  return undefined;
};

const FREE_TEXT_FIELDS: ReadonlySet<string> = new Set(["title"]);

export const TITLE_RULE = "Title must be 3 to 80 characters";
export const titleOk = (title: string) => title.length >= 3 && title.length <= 80;

export const createExperience = async (
  ctx: MutationCtx,
  args: { userId: Id<"users">; actor: Actor; title?: string },
): Promise<Id<"events">> => {
  const { userId, actor } = args;
  const title = args.title?.trim() ?? "Untitled experience";
  if (!titleOk(title)) invalid("title", TITLE_RULE);
  const owned = await ctx.db
    .query("events")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .take(MAX_EVENTS_PER_USER);
  if (owned.length >= MAX_EVENTS_PER_USER) {
    throw new ConvexError({
      code: "EVENT_LIMIT",
      message: `You can have up to ${MAX_EVENTS_PER_USER} experiences. Delete one to make another.`,
    });
  }
  const eventId = await ctx.db.insert("events", {
    ownerId: userId,
    title,
    status: "draft",
    visibility: "private",
    momentCount: 0,
    keyVersion: 1,
  });
  await recordChange(ctx, {
    eventId,
    entity: "event",
    entityId: eventId,
    ...changeFields(actor),
    action: "create",
    fields: ["title", "status", "visibility"],
    // A title someone chose is their words, so it stays out of the log.
    after: {
      ...(args.title === undefined ? { title } : {}),
      status: "draft",
      visibility: "private",
    },
  });
  return eventId;
};

const createDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return createExperience(ctx, { userId, actor: { kind: "human", userId } });
  },
});

const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startsAt: v.optional(v.union(v.number(), v.null())),
    endsAt: v.optional(v.union(v.number(), v.null())),
    visibility: v.optional(vEditableVisibility),
    status: v.optional(vStatus),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");

    const title = args.title?.trim();
    if (title !== undefined && !titleOk(title)) invalid("title", TITLE_RULE);
    if (args.description !== undefined && args.description.length > 2000) {
      invalid("description", "Description must be 2000 characters or fewer");
    }
    const startsAt = args.startsAt === undefined ? event.startsAt : (args.startsAt ?? undefined);
    const endsAt = args.endsAt === undefined ? event.endsAt : (args.endsAt ?? undefined);
    if (startsAt !== undefined && endsAt !== undefined && endsAt < startsAt) {
      invalid("endsAt", "End must be after the start");
    }

    const patch: Partial<Doc<"events">> = {};
    const before: Record<string, string | number | boolean | null> = {};
    const after: Record<string, string | number | boolean | null> = {};
    const fields: string[] = [];

    const note = (
      key: "title" | "startsAt" | "endsAt" | "visibility" | "status",
      next: string | number | null | undefined,
    ) => {
      if (next === undefined || next === (event[key] ?? null)) return;
      (patch as Record<string, unknown>)[key] = next ?? undefined;
      fields.push(key);
      if (FREE_TEXT_FIELDS.has(key)) return;
      before[key] = event[key] ?? null;
      after[key] = next;
    };
    note("title", title);
    note("startsAt", args.startsAt);
    note("endsAt", args.endsAt);
    note("visibility", args.visibility);
    if (event.visibility === "link" && fields.includes("visibility")) {
      patch.shareKey = undefined;
      patch.shareToken = undefined;
    }
    note("status", args.status);

    if (args.description !== undefined) {
      const next = args.description.trim() === "" ? undefined : args.description;
      if (next !== (await readText(event._id, event.description))) {
        patch.description =
          next === undefined ? undefined : await encryptText(event._id, event.keyVersion, next);
        fields.push("description");
      }
    }

    if (fields.length === 0) return null;
    await ctx.db.patch("events", args.eventId, patch);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields,
      before,
      after,
    });
    return null;
  },
});

const get = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return null;
    const access = await getEventAccess(ctx, eventId);
    return access === null ? null : await toView(access.event, access.role);
  },
});

const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return [];
    const owned = await ctx.db
      .query("events")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(100);
    const grants = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    const card = async (event: Doc<"events">, role: EventRole) => {
      const coverMediaId = await coverFor(ctx, event);
      return {
        ...summaryOf(event, role),
        coverMediaId,
        sketch: coverMediaId === undefined ? await sketchFor(ctx, event) : undefined,
      };
    };
    const cards: Array<Awaited<ReturnType<typeof card>>> = [];
    for (const event of owned) cards.push(await card(event, "owner"));
    for (const grant of grants) {
      if (grant.revokedAt !== undefined) continue;
      const event = await ctx.db.get("events", grant.eventId);
      if (event !== null) cards.push(await card(event, grant.role));
    }
    return cards;
  },
});

const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<null> => {
    await requireEventAccess(ctx, args.eventId, "owner");
    await ctx.db.delete("events", args.eventId);
    await ctx.scheduler.runAfter(0, internal.model.events.purgeEventData, {
      eventId: args.eventId,
    });
    return null;
  },
});

const PURGE_BATCH = 200;

export const purgeEventData = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }): Promise<null> => {
    let deleted = 0;
    await eventMedia.clear(ctx, { namespace: eventId });
    await changeCounts.clear(ctx, { namespace: eventId });

    for (const row of await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("moments", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("media")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("media", row._id);
      await uploadBytes.deleteIfExists(ctx, row);
      deleted++;
    }
    for (const row of await ctx.db
      .query("sessions")
      .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("sessions", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("guestNotes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("guestNotes", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("activityReads")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("activityReads", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("changes")
      .withIndex("by_event_and_at", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("changes", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("itinerary")
      .withIndex("by_event_and_day", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("itinerary", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("quotaRequests")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("quotaRequests", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("canvasNodes")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("canvasNodes", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("canvases")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("canvases", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("agentTokens")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("agentTokens", row._id);
      deleted++;
    }
    deleted += await ctx.runMutation(components.invites.lib.removeForEvent, {
      eventId,
    });

    if (deleted > 0) {
      await ctx.scheduler.runAfter(0, internal.model.events.purgeEventData, { eventId });
    }
    return null;
  },
});

export const eventsApi = { createDraft, update, get, listMine, remove };
