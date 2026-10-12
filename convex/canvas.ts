import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertNotArchived, requireEventAccess } from "./lib/access";
import { checkText, invalid } from "./lib/blocks";
import { decryptText, encryptText } from "./lib/crypto";
import { MAX_CANVAS_BATCH, MAX_CANVAS_FILL, MAX_CANVAS_NODES, MAX_MOMENT_LIMIT } from "./lib/limits";
import { vCanvasKind } from "./schema";

// The collage canvas of an experience. Anyone who can see the experience can
// see its canvas; only its owner changes it (people don't edit together yet).
// Every change is to single pieces, so moving a letter writes one row and
// nothing else.

type Kind = Infer<typeof vCanvasKind>;

// What may sit inside what: a frame holds pieces and titles, a title holds
// letters, and the rest may also lie loose on the desk.
const PARENTS: Record<Kind, ReadonlyArray<Kind | "desk">> = {
  frame: ["desk"],
  ransom: ["desk", "frame"],
  letter: ["ransom"],
  moment: ["desk", "frame"],
  photo: ["desk", "frame"],
  scrap: ["desk", "frame"],
  tape: ["desk", "frame"],
};

// Frames and titles stay square to the page, so a child's position needs no
// trigonometry to place.
const TURNS: ReadonlySet<Kind> = new Set(["moment", "photo", "scrap", "tape", "letter"]);

const MAX_COORD = 100_000;
const MIN_SIZE = 4;
const MAX_SIZE = 6000;
const MAX_TEXT = 2000;

export const vNodeView = v.object({
  _id: v.id("canvasNodes"),
  parentId: v.optional(v.id("canvasNodes")),
  kind: vCanvasKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  rotation: v.number(),
  z: v.number(),
  momentId: v.optional(v.id("moments")),
  mediaId: v.optional(v.id("media")),
  text: v.optional(v.string()),
  look: v.optional(v.string()),
  order: v.optional(v.number()),
});
export type NodeView = Infer<typeof vNodeView>;

// A new thing. `parent` is an existing node, or `{ ref }`: the position of an
// earlier node in the same request, so a title and its letters go in together.
const vNodeIn = v.object({
  parent: v.optional(v.union(v.id("canvasNodes"), v.object({ ref: v.number() }))),
  kind: vCanvasKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  rotation: v.optional(v.number()),
  z: v.optional(v.number()),
  momentId: v.optional(v.id("moments")),
  mediaId: v.optional(v.id("media")),
  text: v.optional(v.string()),
  look: v.optional(v.string()),
  order: v.optional(v.number()),
});

// What can change on a thing already there. `parentId: null` takes it off its
// frame and puts it on the desk; `order: null` takes a frame out of the flow.
const vNodePatch = v.object({
  id: v.id("canvasNodes"),
  parentId: v.optional(v.union(v.id("canvasNodes"), v.null())),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  w: v.optional(v.number()),
  h: v.optional(v.number()),
  rotation: v.optional(v.number()),
  z: v.optional(v.number()),
  text: v.optional(v.string()),
  look: v.optional(v.string()),
  order: v.optional(v.union(v.number(), v.null())),
});

const LOOK = /^[a-z0-9_-]{1,24}$/;

function checkLook(look: string | undefined) {
  if (look !== undefined && !LOOK.test(look)) invalid("look", "That look isn't one I know.");
}

function inRange(field: string, n: number, min: number, max: number) {
  if (!Number.isFinite(n) || n < min || n > max) invalid(field, `${field} is out of range.`);
}

function checkGeometry(g: { x: number; y: number; w: number; h: number; rotation: number; z: number }) {
  inRange("x", g.x, -MAX_COORD, MAX_COORD);
  inRange("y", g.y, -MAX_COORD, MAX_COORD);
  inRange("w", g.w, MIN_SIZE, MAX_SIZE);
  inRange("h", g.h, MIN_SIZE, MAX_SIZE);
  inRange("rotation", g.rotation, -360, 360);
  inRange("z", g.z, -1_000_000, 1_000_000);
}

function checkParent(kind: Kind, parent: Doc<"canvasNodes"> | null) {
  if (!PARENTS[kind].includes(parent === null ? "desk" : parent.kind)) {
    invalid("parent", `A ${kind} can't go there.`);
  }
}

const notFound = () => new ConvexError({ code: "NOT_FOUND", message: "That isn't on this canvas any more." });

// Whatever a piece points at has to belong to this experience, and a photo has
// to be on one of its moments: the same rule that lets anyone see it.
async function checkTargets(
  ctx: MutationCtx,
  eventId: Id<"events">,
  n: { kind: Kind; momentId?: Id<"moments">; mediaId?: Id<"media">; text?: string },
) {
  if (n.kind === "moment") {
    const moment = n.momentId === undefined ? null : await ctx.db.get("moments", n.momentId);
    if (moment === null || moment.eventId !== eventId) invalid("momentId", "That moment isn't in this experience.");
  } else if (n.momentId !== undefined) {
    invalid("momentId", "Only a moment piece points at a moment.");
  }
  if (n.kind === "photo") {
    const media = n.mediaId === undefined ? null : await ctx.db.get("media", n.mediaId);
    if (
      media === null ||
      media.eventId !== eventId ||
      media.status !== "ready" ||
      media.momentId === undefined ||
      !media.mime.startsWith("image/")
    ) {
      invalid("mediaId", "That photo isn't in this experience.");
    }
  } else if (n.mediaId !== undefined) {
    invalid("mediaId", "Only a photo piece points at a photo.");
  }
  if ((n.kind === "scrap" || n.kind === "letter") && (n.text === undefined || n.text.trim() === "")) {
    invalid("text", "Write something on it.");
  }
  if (n.kind === "letter" && n.text !== undefined && [...n.text.trim()].length !== 1) {
    invalid("text", "A letter is one character.");
  }
}

async function viewOf(event: Doc<"events">, node: Doc<"canvasNodes">): Promise<NodeView> {
  return {
    _id: node._id,
    parentId: node.parentId,
    kind: node.kind,
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    rotation: node.rotation,
    z: node.z,
    momentId: node.momentId,
    mediaId: node.mediaId,
    text: node.text === undefined ? undefined : await decryptText(event._id, node.text),
    look: node.look,
    order: node.order,
  };
}

async function nodesOf(ctx: QueryCtx | MutationCtx, canvasId: Id<"canvases">) {
  return ctx.db
    .query("canvasNodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .take(MAX_CANVAS_NODES + 1);
}

// The moments made since the canvas was last filled, oldest first, a few at a
// time so one request can hold their pages. `upTo` is when the last was made.
async function pendingMoments(ctx: QueryCtx, eventId: Id<"events">, filledAt: number | undefined) {
  const rows = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(MAX_MOMENT_LIMIT);
  const fresh = rows
    .filter((m) => filledAt === undefined || m._creationTime > filledAt)
    .sort((a, b) => a._creationTime - b._creationTime)
    .slice(0, MAX_CANVAS_FILL);
  const last = fresh.at(-1);
  return last === undefined ? null : { ids: fresh.map((m) => m._id), upTo: last._creationTime };
}

// The canvas of an experience, with everything on it, for anyone who can see
// the experience. `canEdit` says whether this person may change it.
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    canvasId: v.union(v.id("canvases"), v.null()),
    desk: v.string(),
    canEdit: v.boolean(),
    nodes: v.array(vNodeView),
    // The next moments to put on the canvas, for whoever may edit it.
    pending: v.union(v.null(), v.object({ ids: v.array(v.id("moments")), upTo: v.number() })),
  }),
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const canEdit = role === "owner" && event.status !== "archived";
    const canvas = await ctx.db
      .query("canvases")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .unique();
    const pending = canEdit ? await pendingMoments(ctx, event._id, canvas?.filledAt) : null;
    if (canvas === null) {
      const none: NodeView[] = [];
      return { canvasId: null, desk: "desk", canEdit, nodes: none, pending };
    }
    const rows = (await nodesOf(ctx, canvas._id)).slice(0, MAX_CANVAS_NODES);
    const nodes = await Promise.all(rows.map((row) => viewOf(event, row)));
    // Back to front; ties keep the order they were made in.
    nodes.sort((a, b) => a.z - b.z);
    return { canvasId: canvas._id, desk: canvas.desk, canEdit, nodes, pending };
  },
});

// The canvas to work on, made the first time it's needed.
export const ensure = mutation({
  args: { eventId: v.id("events") },
  returns: v.id("canvases"),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const existing = await ctx.db
      .query("canvases")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .unique();
    return existing?._id ?? ctx.db.insert("canvases", { eventId: event._id, desk: "desk" });
  },
});

// `filled` marks the moments made up to that time as put on the canvas, in the
// same step. A second request for a time already marked adds nothing, so two
// windows filling the same canvas don't make it twice.
export const add = mutation({
  args: { canvasId: v.id("canvases"), nodes: v.array(vNodeIn), filled: v.optional(v.number()) },
  returns: v.array(v.id("canvasNodes")),
  handler: async (ctx, args) => {
    const canvas = await ctx.db.get("canvases", args.canvasId);
    if (canvas === null) throw notFound();
    const { event } = await requireEventAccess(ctx, canvas.eventId, "owner");
    assertNotArchived(event);
    if (args.filled !== undefined) {
      if (canvas.filledAt !== undefined && canvas.filledAt >= args.filled) return [];
      await ctx.db.patch("canvases", canvas._id, { filledAt: args.filled });
    } else if (args.nodes.length === 0) invalid("nodes", "There is nothing to add.");
    if (args.nodes.length > MAX_CANVAS_BATCH) invalid("nodes", `Add at most ${MAX_CANVAS_BATCH} things at once.`);
    if ((await nodesOf(ctx, canvas._id)).length + args.nodes.length > MAX_CANVAS_NODES) {
      throw new ConvexError({ code: "FULL", message: `A canvas holds up to ${MAX_CANVAS_NODES} things.` });
    }

    const ids: Id<"canvasNodes">[] = [];
    for (const [i, n] of args.nodes.entries()) {
      let parent: Doc<"canvasNodes"> | null = null;
      if (n.parent !== undefined) {
        const parentId = typeof n.parent === "object" ? (n.parent.ref < i ? ids[n.parent.ref] : undefined) : n.parent;
        parent = parentId === undefined ? null : await ctx.db.get("canvasNodes", parentId);
        if (parent === null || parent.canvasId !== canvas._id) invalid("parent", "That frame isn't on this canvas.");
      }
      checkParent(n.kind, parent);
      const geometry = { x: n.x, y: n.y, w: n.w, h: n.h, rotation: n.rotation ?? 0, z: n.z ?? 0 };
      checkGeometry(geometry);
      if (geometry.rotation !== 0 && !TURNS.has(n.kind)) invalid("rotation", `A ${n.kind} stays square.`);
      checkLook(n.look);
      await checkTargets(ctx, event._id, n);
      const text = n.text === undefined || n.text.trim() === "" ? undefined : checkText("text", n.text, MAX_TEXT);
      ids.push(
        await ctx.db.insert("canvasNodes", {
          canvasId: canvas._id,
          eventId: event._id,
          parentId: parent?._id,
          kind: n.kind,
          ...geometry,
          momentId: n.momentId,
          mediaId: n.mediaId,
          text: text === undefined ? undefined : await encryptText(event._id, event.keyVersion, text),
          look: n.look,
          order: n.order,
        }),
      );
    }
    return ids;
  },
});

// Moves, sizes, turns, restacks, rewrites or restyles things. Only what is
// sent changes, and a whole drag or a nudge of many pieces is one request.
export const patch = mutation({
  args: { updates: v.array(vNodePatch) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.updates.length === 0) return null;
    if (args.updates.length > MAX_CANVAS_BATCH) invalid("updates", `Change at most ${MAX_CANVAS_BATCH} things at once.`);
    const first = await ctx.db.get("canvasNodes", args.updates[0]!.id);
    if (first === null) throw notFound();
    const { event } = await requireEventAccess(ctx, first.eventId, "owner");
    assertNotArchived(event);

    for (const u of args.updates) {
      const node = await ctx.db.get("canvasNodes", u.id);
      if (node === null || node.eventId !== event._id) throw notFound();

      let parentId = node.parentId;
      if (u.parentId !== undefined) {
        const parent = u.parentId === null ? null : await ctx.db.get("canvasNodes", u.parentId);
        if (u.parentId !== null && (parent === null || parent.canvasId !== node.canvasId)) {
          invalid("parent", "That frame isn't on this canvas.");
        }
        checkParent(node.kind, parent);
        parentId = parent?._id;
      }
      const geometry = {
        x: u.x ?? node.x,
        y: u.y ?? node.y,
        w: u.w ?? node.w,
        h: u.h ?? node.h,
        rotation: u.rotation ?? node.rotation,
        z: u.z ?? node.z,
      };
      checkGeometry(geometry);
      if (geometry.rotation !== 0 && !TURNS.has(node.kind)) invalid("rotation", `A ${node.kind} stays square.`);
      checkLook(u.look);

      const next: Partial<Doc<"canvasNodes">> = { ...geometry, parentId, look: u.look ?? node.look };
      if (u.order !== undefined) next.order = u.order === null ? undefined : u.order;
      if (u.text !== undefined) {
        const text = u.text.trim() === "" ? undefined : checkText("text", u.text, MAX_TEXT);
        await checkTargets(ctx, event._id, { kind: node.kind, momentId: node.momentId, mediaId: node.mediaId, text });
        next.text = text === undefined ? undefined : await encryptText(event._id, event.keyVersion, text);
      }
      await ctx.db.patch("canvasNodes", node._id, next);
    }
    return null;
  },
});

// Takes things off the canvas, with everything inside them. Their moments and
// photos are untouched: a piece is only a place to see them.
export const remove = mutation({
  args: { ids: v.array(v.id("canvasNodes")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.ids.length === 0) return 0;
    if (args.ids.length > MAX_CANVAS_BATCH) invalid("ids", `Remove at most ${MAX_CANVAS_BATCH} things at once.`);
    // Whatever is already gone is skipped, so a double click or an undo that
    // raced it does no harm.
    const found = (await Promise.all([...new Set(args.ids)].map((id) => ctx.db.get("canvasNodes", id)))).filter(
      (node): node is Doc<"canvasNodes"> => node !== null,
    );
    if (found.length === 0) return 0;
    const { event } = await requireEventAccess(ctx, found[0]!.eventId, "owner");
    assertNotArchived(event);

    let removed = 0;
    for (const node of found) {
      if (node.eventId !== event._id) throw notFound();
      // A frame removed earlier in this request took this one with it.
      if ((await ctx.db.get("canvasNodes", node._id)) === null) continue;
      // Frames hold titles hold letters: two levels down at most.
      const children = await ctx.db
        .query("canvasNodes")
        .withIndex("by_parent", (q) => q.eq("parentId", node._id))
        .take(MAX_CANVAS_NODES);
      for (const child of children) {
        const grandchildren = await ctx.db
          .query("canvasNodes")
          .withIndex("by_parent", (q) => q.eq("parentId", child._id))
          .take(MAX_CANVAS_NODES);
        for (const g of grandchildren) {
          await ctx.db.delete("canvasNodes", g._id);
          removed++;
        }
        await ctx.db.delete("canvasNodes", child._id);
        removed++;
      }
      await ctx.db.delete("canvasNodes", node._id);
      removed++;
    }
    return removed;
  },
});
