import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";
import {
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  type EventRole,
} from "../lib/access";
import { recordChange } from "../lib/changes";
import { coverWords, followCover } from "../lib/cover";
import { decryptGeo, encryptText, readText } from "../lib/crypto";
import { MAX_EVENTS_PER_USER } from "../lib/limits";
import { vGeo } from "../schema";

const vStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);
const vVisibility = v.union(
  v.literal("private"),
  v.literal("invite"),
  v.literal("link"),
);
// Owners set these by hand. A link is switched on and off only in share.ts.
const vEditableVisibility = v.union(v.literal("private"), v.literal("invite"));
const vRoleOut = v.union(
  v.literal("owner"),
  v.literal("contributor"),
  v.literal("viewer"),
);

const vEventView = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  status: vStatus,
  visibility: vVisibility,
  momentCount: v.number(),
  role: vRoleOut,
});

// The home grid's card: the event plus a photo to show on it.
const vEventCard = vEventView.omit("description").extend({
  coverMediaId: v.optional(v.id("media")),
  // With no photo to show, the shape of the trip: its first stops on the map,
  // rounded, for a drawn cover. Absent with fewer than two places.
  sketch: v.optional(v.array(vGeo)),
});

// Moments read for a sketch, and the most points it keeps: enough for a shape.
const SKETCH_MOMENTS = 12;
const SKETCH_POINTS = 40;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// The first stops of an experience with a place on the map, in time order,
// rounded to about 100 m (it is a drawing, not a map). Repeats in a row drop out.
async function sketchFor(ctx: QueryCtx, event: Doc<"events">) {
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
}

// The experience as a home card shows it. No description: the cards never
// show one, so there's nothing to decrypt for them.
function summaryOf(event: Doc<"events">, role: EventRole) {
  return {
    _id: event._id,
    _creationTime: event._creationTime,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    visibility: event.visibility,
    momentCount: event.momentCount,
    role,
  };
}

async function toView(event: Doc<"events">, role: EventRole) {
  return { ...summaryOf(event, role), description: await readText(event._id, event.description) };
}

// The chosen cover, else the first photo (not video) of the earliest few
// moments, first stop before later ones. Bounded to 5 moments per event.
async function coverFor(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Id<"media"> | undefined> {
  if (event.coverMediaId !== undefined) return event.coverMediaId;
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(5);
  for (const moment of moments) {
    for (const blocks of [moment.blocks, ...(moment.stops ?? []).map((s) => s.blocks)]) {
      for (const block of blocks) if (block.type === "photo") return block.mediaId;
    }
  }
  return undefined;
}

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

const createDraft = mutation({
  args: {},
  returns: v.id("events"),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Bounded: the count only needs to reach the cap. Deleting one frees a slot.
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
      title: "Untitled experience",
      status: "draft",
      visibility: "private",
      momentCount: 0,
      keyVersion: 1,
    });
    await recordChange(ctx, {
      eventId,
      entity: "event",
      entityId: eventId,
      actorId: userId,
      action: "create",
      fields: ["title", "status", "visibility"],
      after: {
        title: "Untitled experience",
        status: "draft",
        visibility: "private",
      },
    });
    return eventId;
  },
});

const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()), // "" clears it
    // null clears a date; omitted leaves it as is.
    startsAt: v.optional(v.union(v.number(), v.null())),
    endsAt: v.optional(v.union(v.number(), v.null())),
    visibility: v.optional(vEditableVisibility),
    status: v.optional(vStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "owner",
    );

    const title = args.title?.trim();
    if (title !== undefined && (title.length < 3 || title.length > 80)) {
      invalid("title", "Title must be 3 to 80 characters");
    }
    if (args.description !== undefined && args.description.length > 2000) {
      invalid("description", "Description must be 2000 characters or fewer");
    }
    const startsAt =
      args.startsAt === undefined ? event.startsAt : (args.startsAt ?? undefined);
    const endsAt =
      args.endsAt === undefined ? event.endsAt : (args.endsAt ?? undefined);
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
      // null clears the field; history records it as null.
      if (next === undefined || next === (event[key] ?? null)) return;
      (patch as Record<string, unknown>)[key] = next ?? undefined;
      fields.push(key);
      // The title is free text, like the description: log that it changed,
      // never its words.
      if (key === "title") return;
      before[key] = event[key] ?? null;
      after[key] = next;
    };
    note("title", title);
    note("startsAt", args.startsAt);
    note("endsAt", args.endsAt);
    note("visibility", args.visibility);
    // Taking the link off here, rather than under Shared, switches it off too.
    if (event.visibility === "link" && fields.includes("visibility")) {
      patch.shareKey = undefined;
      patch.shareToken = undefined;
    }
    note("status", args.status);

    // Free text is user content: log that it changed, never its value.
    if (args.description !== undefined) {
      const next = args.description.trim() === "" ? undefined : args.description;
      if (next !== (await readText(event._id, event.description))) {
        patch.description = next === undefined ? undefined : await encryptText(event._id, event.keyVersion, next);
        fields.push("description");
      }
    }

    if (fields.length === 0) return null;
    await ctx.db.patch("events", args.eventId, patch);
    if (fields.includes("title") || fields.includes("startsAt") || fields.includes("endsAt")) {
      const updated = await ctx.db.get("events", args.eventId);
      if (updated !== null) await followCover(ctx, updated, await coverWords(ctx, event), await coverWords(ctx, updated));
    }
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

// Takes a string: the id comes from the URL, and a malformed one should read
// as "not found" rather than fail validation.
const get = query({
  args: { eventId: v.string() },
  returns: v.union(v.null(), vEventView),
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (eventId === null) return null;
    const access = await getEventAccess(ctx, eventId);
    return access === null ? null : await toView(access.event, access.role);
  },
});

const listMine = query({
  args: {},
  returns: v.array(vEventCard),
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

// Delete an experience. Deleting the row ends everyone's access at once; the
// rest is cleaned up in batches so a large experience can't hit write limits.
// R2 objects are removed first by DELETE /api/events/$id, which calls this.
const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  // Explicit return types: these handlers reference `internal.model.events`,
  // which TypeScript would otherwise infer from these same functions.
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
      .query("journalPages")
      .withIndex("by_event_and_order", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("journalPages", row._id);
      deleted++;
    }
    for (const row of await ctx.db
      .query("journals")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(PURGE_BATCH)) {
      await ctx.db.delete("journals", row._id);
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
    // Legacy tables: nothing writes them any more, but older experiences
    // still have rows. Removed with the tables (simplification A2).
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
    // A token limited to this experience. Account-wide tokens have no eventId
    // and stay until A2 drops the table.
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

// What the app calls. Registered once, by convex/api/events.ts, which re-exports it.
export const eventsApi = { createDraft, update, get, listMine, remove };
