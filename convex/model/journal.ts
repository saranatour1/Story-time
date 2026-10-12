import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { action, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { invalid } from "../lib/blocks";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText } from "../lib/crypto";
import {
  catchUpElements,
  layoutPrefix,
  coverPage,
  DECOS,
  DRAW_STYLES,
  type JournalElement,
  LINK_STYLES,
  MAX_DRAWING_TEXT,
  MAX_ELEMENT_TEXT,
  MAX_LINK_TEXT,
  MAX_JOURNAL_PAGES,
  MAX_PAGE_ELEMENTS,
  momentPage,
  NOTE_STYLES,
  onPage,
  PAPERS,
  PRINT_STYLES,
  tripDates,
  readLink,
  TITLE_STYLES,
  TONES,
} from "../lib/journal";
import { IMAGE_MIME_TYPES, momentsToRead } from "../lib/limits";
import { rateLimiter } from "../lib/rateLimit";
import { type LinkPreview, previewFromHtml } from "./ai/unfurl";
import { viewMoment } from "./moments";
import { vJournalKind } from "../schema";

// The journal of an experience: a book of A4 pages made from its moments and
// then cut, taped and written on by its owner. Anyone who can see the
// experience can read it; only the owner changes it, and not once it, or the
// page, is locked.

const vElement = v.object({
  id: v.string(),
  kind: vJournalKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  rotation: v.number(),
  z: v.number(),
  style: v.optional(v.string()),
  text: v.optional(v.string()),
  tone: v.optional(v.string()),
  color: v.optional(v.string()),
  mediaId: v.optional(v.id("media")),
  momentId: v.optional(v.id("moments")),
  locked: v.optional(v.boolean()),
  own: v.optional(v.boolean()),
});
type ElementIn = Infer<typeof vElement>;

// A laid-out element with the ids it was made from, typed as the table's.
const fromLayout = (elements: JournalElement[]): ElementIn[] =>
  elements.map((e) => ({ ...e, mediaId: e.mediaId as Id<"media"> | undefined, momentId: e.momentId as Id<"moments"> | undefined }));

export const vPageView = v.object({
  _id: v.id("journalPages"),
  order: v.number(),
  paper: v.string(),
  locked: v.boolean(),
  momentId: v.optional(v.id("moments")),
  // The owner has saved this page. A moment that changed since the layout
  // was made is `stale`. `gone` means the moment itself was deleted.
  edited: v.boolean(),
  stale: v.boolean(),
  gone: v.boolean(),
  elements: v.array(vElement),
});

const STYLES: Record<ElementIn["kind"], ReadonlySet<string> | null> = {
  photo: new Set(PRINT_STYLES),
  sticker: null,
  title: new Set(TITLE_STYLES),
  note: new Set(NOTE_STYLES),
  deco: new Set(DECOS),
  map: null,
  drawing: new Set(DRAW_STYLES),
  link: new Set(LINK_STYLES),
};
const PAPER_SET = new Set<string>(PAPERS);
const TONE_SET = new Set<string>(TONES);

const notFound = () => new ConvexError({ code: "NOT_FOUND", message: "That page isn't here any more." });

async function journalOf(ctx: QueryCtx, eventId: Id<"events">) {
  return ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
}

async function pagesOf(ctx: QueryCtx, eventId: Id<"events">) {
  return ctx.db
    .query("journalPages")
    .withIndex("by_event_and_order", (q) => q.eq("eventId", eventId))
    .take(MAX_JOURNAL_PAGES + 1);
}

// A sticker (or any picture) is still on a page of this experience.
export async function mediaOnAPage(ctx: QueryCtx, eventId: Id<"events">, mediaId: Id<"media">) {
  const pages = await pagesOf(ctx, eventId);
  return pages.some((page) => page.elements.some((element) => element.mediaId === mediaId));
}

// A page to change, with the experience it is in. Only the owner, never on an
// archived experience, and never while the page or the journal is locked
// (`unlocking` lets the lock itself be taken off).
async function editablePage(ctx: MutationCtx, pageId: Id<"journalPages">, unlocking = false) {
  const page = await ctx.db.get("journalPages", pageId);
  if (page === null) throw notFound();
  const { event } = await requireEventAccess(ctx, page.eventId, "owner");
  assertNotArchived(event);
  const journal = await journalOf(ctx, event._id);
  if (journal?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
  if (page.locked && !unlocking) throw new ConvexError({ code: "LOCKED", message: "This page is locked. Unlock it to change it." });
  return { page, event };
}

// Checks what a page holds and encrypts its words. With `drop`, anything that
// doesn't belong (a photo from another experience, an unknown style) is left
// out instead of refused: that is how an imported journal comes in.
async function encodeElements(
  ctx: QueryCtx,
  event: Doc<"events">,
  elements: ElementIn[],
  drop = false,
): Promise<Doc<"journalPages">["elements"]> {
  if (elements.length > MAX_PAGE_ELEMENTS) invalid("elements", `A page holds up to ${MAX_PAGE_ELEMENTS} things.`);
  const media = new Map<string, Doc<"media"> | null>();
  const moments = new Map<string, Doc<"moments"> | null>();
  const mediaOf = async (id: Id<"media">) => {
    if (!media.has(id)) media.set(id, await ctx.db.get("media", id));
    return media.get(id) ?? null;
  };
  const momentOf = async (id: Id<"moments">) => {
    if (!moments.has(id)) moments.set(id, await ctx.db.get("moments", id));
    return moments.get(id) ?? null;
  };
  const seen = new Set<string>();
  const out: Doc<"journalPages">["elements"] = [];
  for (const e of elements) {
    const problem = await problemWith(e);
    if (problem !== undefined) {
      if (drop) continue;
      invalid("elements", problem);
    }
    seen.add(e.id);
    const text = e.text === undefined || e.text.trim() === "" ? undefined : await encryptText(event._id, event.keyVersion, e.text);
    out.push({ ...e, rotation: e.rotation % 360, text });
  }
  return out;

  async function problemWith(e: ElementIn): Promise<string | undefined> {
    if (e.id.length === 0 || e.id.length > 40 || seen.has(e.id)) return "Each thing on a page needs its own id.";
    if (![e.x, e.y, e.w, e.h, e.z].every(onPage) || !Number.isFinite(e.rotation)) return "That doesn't fit on a page.";
    if (e.w < 4 || e.h < 4) return "That is too small to see.";
    const styles = STYLES[e.kind];
    if (e.style !== undefined && (styles === null || !styles.has(e.style))) return `There is no ${e.kind} style called "${e.style}".`;
    if (e.tone !== undefined && !TONE_SET.has(e.tone)) return "That tone doesn't exist.";
    const most = e.kind === "drawing" ? MAX_DRAWING_TEXT : e.kind === "link" ? MAX_LINK_TEXT : MAX_ELEMENT_TEXT;
    if (e.text !== undefined && e.text.length > most) return e.kind === "drawing" ? "That drawing is too big. Start another one." : `Words on a page are at most ${most} characters.`;
    if ((e.kind === "drawing" || e.kind === "link") && !e.text?.trim()) return e.kind === "drawing" ? "A drawing needs its strokes." : "A link needs its address.";
    if (e.kind === "link" && !readLink(e.text)) return "A link needs a web address.";
    if (e.color !== undefined && !/^#[0-9a-f]{6}$/i.test(e.color)) return "That colour isn't one.";
    const pictured = e.kind === "photo" || e.kind === "sticker";
    if (pictured !== (e.mediaId !== undefined)) return pictured ? "A photo needs a picture." : "Only photos and stickers show a picture.";
    if (e.mediaId !== undefined) {
      const m = await mediaOf(e.mediaId);
      const ok =
        m !== null &&
        m.eventId === event._id &&
        m.status === "ready" &&
        m.mime.startsWith("image/") &&
        (e.kind === "sticker" ? m.purpose === "sticker" : m.momentId !== undefined || m.purpose === "sticker");
      if (!ok) return "That photo isn't in this experience.";
    }
    if ((e.kind === "map") !== (e.momentId !== undefined)) return e.kind === "map" ? "A map shows a moment's stops." : "Only a map points at a moment.";
    if (e.momentId !== undefined) {
      const m = await momentOf(e.momentId);
      if (m === null || m.eventId !== event._id) return "That moment isn't in this experience.";
    }
    return undefined;
  }
}

// Whether this page still matches the moment it was laid out from. Comparing
// stored times, never the clock, so a query can say so.
async function catchUpState(ctx: QueryCtx, page: Doc<"journalPages">) {
  const edited = page.edited ?? false;
  if (page.momentId === undefined) return { edited, stale: false, gone: false };
  const moment = await ctx.db.get("moments", page.momentId);
  if (moment === null) return { edited, stale: false, gone: true };
  const stamp = moment.lastEdit?.at ?? moment._creationTime;
  return { edited, stale: page.builtFrom !== undefined && page.builtFrom !== stamp, gone: false };
}

// A link card's picture, whatever scheme it uses. `readLink` only reports
// https pictures, so an http URL would otherwise stay in the JSON.
function withoutLinkImage(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("image" in parsed)) return text;
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== "image") copy[key] = value;
    }
    return JSON.stringify(copy);
  } catch {
    return text;
  }
}

// A share link that hides photos drops every picture and sticker, and the
// preview image on a link card, before anything is returned. The address of
// the link stays; the picture URL does not.
function withoutPictures(elements: Infer<typeof vElement>[]): Infer<typeof vElement>[] {
  const kept: Infer<typeof vElement>[] = [];
  for (const element of elements) {
    if (element.kind === "photo" || element.kind === "sticker" || element.mediaId !== undefined) continue;
    if (element.kind === "link" && element.text !== undefined) {
      kept.push({ ...element, text: withoutLinkImage(element.text) });
      continue;
    }
    kept.push(element);
  }
  return kept;
}

async function viewPage(ctx: QueryCtx, event: Doc<"events">, page: Doc<"journalPages">, redact = false) {
  const elements = await Promise.all(
    page.elements.map(async (e) => ({ ...e, text: e.text === undefined ? undefined : await decryptText(event._id, e.text) })),
  );
  return {
    _id: page._id,
    order: page.order,
    paper: page.paper,
    locked: page.locked ?? false,
    momentId: page.momentId,
    ...(await catchUpState(ctx, page)),
    elements: redact ? withoutPictures(elements) : elements,
  };
}

// How many moments still need a page. A journal that does not exist yet still
// owes its cover, so the count is at least 1.
async function pendingOf(ctx: QueryCtx, event: Doc<"events">, journal: Doc<"journals"> | null) {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  let pending = moments.filter((m) => journal?.filledAt === undefined || m._creationTime > journal.filledAt).length;
  if (journal === null) pending = Math.max(pending, 1);
  return pending;
}

// A short line for the page strip: the first title or note, not the drawing.
async function labelOf(event: Doc<"events">, page: Doc<"journalPages">) {
  const text = page.elements.find((e) => (e.kind === "title" || e.kind === "note") && e.text !== undefined)?.text;
  if (text === undefined) return "";
  return (await decryptText(event._id, text)).replace(/\s+/g, " ").trim().slice(0, 80);
}

export const vOutlinePage = v.object({
  _id: v.id("journalPages"),
  order: v.number(),
  paper: v.string(),
  locked: v.boolean(),
  momentId: v.optional(v.id("moments")),
  label: v.string(),
  edited: v.boolean(),
  stale: v.boolean(),
  gone: v.boolean(),
});

// The book the screen keeps open: who may edit, how many pages are still owed,
// and a contents list. Words stay on `page`, so one subscription does not
// decrypt every page.
const outline = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const canEdit = role === "owner" && event.status !== "archived";
    const pending = canEdit && !journal?.locked ? await pendingOf(ctx, event, journal) : 0;
    return { canEdit, locked: journal?.locked ?? false, pending, pages: await contentsOf(ctx, event) };
  },
});

// The contents of a book: one short label per page, not every word. The share
// link uses this too, after the token has already picked the experience.
export async function contentsOf(ctx: QueryCtx, event: Doc<"events">) {
  return Promise.all(
    (await pagesOf(ctx, event._id)).slice(0, MAX_JOURNAL_PAGES).map(async (page) => ({
      _id: page._id,
      order: page.order,
      paper: page.paper,
      locked: page.locked ?? false,
      momentId: page.momentId,
      label: await labelOf(event, page),
      ...(await catchUpState(ctx, page)),
    })),
  );
}

// One page of this experience, decrypted. Null when the page is missing or
// belongs to another experience, so a share token cannot name its way in.
export async function pageInEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
  pageId: Id<"journalPages">,
  redact = false,
) {
  const row = await ctx.db.get("journalPages", pageId);
  if (row === null || row.eventId !== event._id) return null;
  return await viewPage(ctx, event, row, redact);
}

// One page, decrypted. The open page, a neighbour, or a page being printed.
const page = query({
  args: { pageId: v.id("journalPages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("journalPages", args.pageId);
    if (row === null) return null;
    const { event } = await requireEventAccess(ctx, row.eventId, "viewer");
    return await viewPage(ctx, event, row);
  },
});

// The saved page for a moment, or the cover when no moment is named. Null when
// that page was never made or was taken out: the caller does not invent one.
const pageForMoment = query({
  args: { eventId: v.id("events"), momentId: v.optional(v.id("moments")) },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const row =
      args.momentId === undefined
        ? (await pagesOf(ctx, event._id))[0]
        : await ctx.db
            .query("journalPages")
            .withIndex("by_event_and_moment", (q) => q.eq("eventId", event._id).eq("momentId", args.momentId))
            .first();
    return row === undefined || row === null ? null : await viewPage(ctx, event, row);
  },
});

// The whole book, decrypted. Tests and the one-shot journal file use this.
// The open book does not: it subscribes to `outline` and `page`.
const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const canEdit = role === "owner" && event.status !== "archived";
    const pending = canEdit && !journal?.locked ? await pendingOf(ctx, event, journal) : 0;
    const pages = await Promise.all((await pagesOf(ctx, event._id)).slice(0, MAX_JOURNAL_PAGES).map((p) => viewPage(ctx, event, p)));
    return { canEdit, locked: journal?.locked ?? false, pending, pages };
  },
});

// How many pages one transaction will cut and paste. Each page decrypts a
// moment and encrypts what it prints, so a purge-sized batch would blow the
// write limit on a long import. Twenty finishes a normal visit in one go
// (the cover and a handful of moments); the rest is scheduled.
const PAGE_BATCH = 20;

async function insertPage(
  ctx: MutationCtx,
  eventId: Id<"events">,
  page: {
    order: number;
    paper: string;
    elements: Doc<"journalPages">["elements"];
    momentId?: Id<"moments">;
    builtFrom?: number;
  },
  actorId?: Id<"users">,
) {
  const pageId = await ctx.db.insert("journalPages", { eventId, ...page });
  await recordChange(ctx, {
    eventId,
    entity: "page",
    entityId: pageId,
    actorId,
    action: "create",
    fields: ["order"],
  });
  return pageId;
}

// Pages for moments made since `filledAt`, and the cover when the journal is
// new. One batch per call. `more` means another batch should run: the book
// still has room and a moment is still waiting. A locked journal changes
// nothing, so `filledAt` does not step over a page that was never made.
async function makePageBatch(ctx: MutationCtx, event: Doc<"events">): Promise<{ made: number; more: boolean }> {
  const existing = await journalOf(ctx, event._id);
  if (existing?.locked) return { made: 0, more: false };
  const rows = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  // The cover arrives with the first moment, not for an empty trip.
  if (existing === null && rows.length === 0) return { made: 0, more: false };

  const created = existing ?? (await ctx.db.get("journals", await ctx.db.insert("journals", { eventId: event._id })));
  if (created === null) throw new Error("Journal missing");
  const journal = created;
  const fresh = rows.filter((m) => journal.filledAt === undefined || m._creationTime > journal.filledAt);
  let room = MAX_JOURNAL_PAGES - (await pagesOf(ctx, event._id)).length;
  let made = 0;
  let more = false;

  if (existing === null && room > 0) {
    const views = [await viewMoment(ctx, event, rows[0]!)];
    const photo = [views[0]!.blocks, ...views[0]!.stops.map((s) => s.blocks)].flat().find((b) => b.type === "photo");
    const cover = coverPage({
      id: event._id,
      title: event.title,
      dates: tripDates(event, rows[0], rows.at(-1)),
      photo: photo?.type === "photo" ? photo.mediaId : undefined,
    });
    await insertPage(ctx, event._id, {
      order: 0,
      paper: cover.paper,
      elements: await encodeElements(ctx, event, fromLayout(cover.elements)),
    });
    room--;
    made++;
  }

  // Creation order, not the order they happened: `filledAt` is a high-water
  // mark, so a moment that did not fit must stay above it.
  const waiting = [...fresh].sort((a, b) => a._creationTime - b._creationTime);
  let watermark = journal.filledAt;
  for (const row of waiting) {
    const has = await ctx.db
      .query("journalPages")
      .withIndex("by_event_and_moment", (q) => q.eq("eventId", event._id).eq("momentId", row._id))
      .first();
    if (has === null) {
      if (room <= 0) break;
      if (made >= PAGE_BATCH) {
        more = true;
        break;
      }
      const moment = await viewMoment(ctx, event, row);
      const spec = momentPage({ ...moment, stops: moment.stops }, rows.indexOf(row));
      await insertPage(ctx, event._id, {
        order: row.startsAt,
        paper: spec.paper,
        momentId: row._id,
        builtFrom: row.lastEdit?.at ?? row._creationTime,
        elements: await encodeElements(ctx, event, fromLayout(spec.elements), true),
      });
      room--;
      made++;
    }
    watermark = row._creationTime;
  }
  if (watermark !== undefined && watermark !== journal.filledAt) {
    await ctx.db.patch("journals", journal._id, { filledAt: watermark });
  }
  return { made, more };
}

// The next batch of pages for an experience. Scheduled from the moment write,
// and again from here until the fresh moments are paged or the book is full.
// Missing and archived experiences are skipped: the job may outlive them.
export const makePages = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get("events", args.eventId);
    if (event === null || event.status === "archived") return null;
    const { more } = await makePageBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return null;
  },
});

// Moments that were saved before paging ran, or while the book was locked,
// still owe a page. This walks experiences and cuts the next batch for each.
// A page taken out on purpose stays out: it is already behind `filledAt`.
export const backfillWaiting = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.query("events").paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const event of page.page) {
      if (event.status === "archived") continue;
      await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.model.journal.backfillWaiting, { cursor: page.continueCursor });
    }
    return null;
  },
});

// The same batch, run now, for the owner. A long trip continues in `makePages`.
// Safe to call twice: the second finds nothing new.
const fill = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<number> => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const { made, more } = await makePageBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return made;
  },
});

// Moments that will never get a page because the book already holds
// `MAX_JOURNAL_PAGES`. A page taken out on purpose is not listed: that moment
// is already behind `filledAt`.
const unpaged = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(momentsToRead(event.momentCount));
    const waiting = moments.filter((m) => journal?.filledAt === undefined || m._creationTime > journal.filledAt);
    // Nothing waiting is the usual case: then the pages, which change on every
    // save in the journal, are never read and this list doesn't re-run with them.
    if (waiting.length === 0 || (await pagesOf(ctx, event._id)).length < MAX_JOURNAL_PAGES) return { full: false, momentIds: [] };
    return { full: true, momentIds: waiting.map((m) => m._id) };
  },
});

function wordsOf(text: string | undefined): string | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  return text;
}

// A thing locked in place may be unlocked, and nothing else about it may change.
// Taking it off the page, or moving it in the same save as the unlock, is refused.
async function lockedStay(event: Doc<"events">, stored: Doc<"journalPages">["elements"], incoming: ElementIn[]) {
  const byId = new Map(incoming.map((e) => [e.id, e]));
  for (const old of stored) {
    if (old.locked !== true) continue;
    const next = byId.get(old.id);
    if (next === undefined) throw new ConvexError({ code: "LOCKED", message: "That is locked in place." });
    const storedText = wordsOf(old.text === undefined ? undefined : await decryptText(event._id, old.text));
    const same =
      next.kind === old.kind &&
      next.x === old.x &&
      next.y === old.y &&
      next.w === old.w &&
      next.h === old.h &&
      next.rotation % 360 === old.rotation &&
      next.z === old.z &&
      next.style === old.style &&
      next.tone === old.tone &&
      next.color === old.color &&
      next.mediaId === old.mediaId &&
      next.momentId === old.momentId &&
      wordsOf(next.text) === storedText;
    if (!same) throw new ConvexError({ code: "LOCKED", message: "That is locked in place." });
  }
}

// A layout piece whose words this save changes becomes the owner's (`own`),
// so a later "Update this page" keeps it. Only the layout's pieces are
// checked, and each only until it is theirs.
async function markRetyped(event: Doc<"events">, page: Doc<"journalPages">, elements: ElementIn[]): Promise<ElementIn[]> {
  if (page.momentId === undefined) return elements;
  const prefix = layoutPrefix(page.momentId);
  const before = new Map(page.elements.map((e) => [e.id, e]));
  return Promise.all(
    elements.map(async (e) => {
      const old = before.get(e.id);
      if (old === undefined || !e.id.startsWith(prefix)) return e;
      if (old.own) return { ...e, own: true };
      const was = old.text === undefined ? "" : await decryptText(event._id, old.text);
      return was !== (e.text ?? "") ? { ...e, own: true } : e;
    }),
  );
}

// Saves what is on a page (all of it: a page is small), and its paper.
const savePage = mutation({
  args: { pageId: v.id("journalPages"), paper: v.optional(v.string()), elements: v.array(vElement) },
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId);
    if (args.paper !== undefined && !PAPER_SET.has(args.paper)) invalid("paper", "That paper doesn't exist.");
    await lockedStay(event, page.elements, args.elements);
    await ctx.db.patch("journalPages", page._id, {
      paper: args.paper ?? page.paper,
      elements: await encodeElements(ctx, event, await markRetyped(event, page, args.elements)),
      edited: true,
    });
    return null;
  },
});

// Lays a moment's page out again from the moment as it is now. An untouched
// page is replaced. A page the owner has saved keeps what they added and
// replaces the layout's own pieces, and only when `force` (they asked).
// A deleted moment is left on the page. Returns whether the page changed.
async function refreshOne(ctx: MutationCtx, event: Doc<"events">, page: Doc<"journalPages">, force: boolean): Promise<boolean> {
  if (page.momentId === undefined || page.locked) return false;
  if (page.edited && !force) return false;
  const moment = await ctx.db.get("moments", page.momentId);
  if (moment === null || moment.eventId !== event._id) return false;
  const stamp = moment.lastEdit?.at ?? moment._creationTime;
  // A page made before this field existed is left alone: we cannot tell a
  // handmade page from one that simply predates the stamp.
  if (page.builtFrom === undefined || page.builtFrom === stamp) return false;
  const rows = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  const view = await viewMoment(ctx, event, moment);
  const spec = momentPage({ ...view, stops: view.stops }, Math.max(0, rows.findIndex((row) => row._id === moment._id)));
  const fresh = fromLayout(spec.elements);
  const next = page.edited ? catchUpElements((await viewPage(ctx, event, page)).elements, fresh, moment._id) : fresh;
  await ctx.db.patch("journalPages", page._id, {
    elements: await encodeElements(ctx, event, next, true),
    builtFrom: stamp,
  });
  return true;
}

// Untouched stale pages, one batch. `more` means another batch should run.
async function refreshBatch(ctx: MutationCtx, event: Doc<"events">): Promise<{ made: number; more: boolean }> {
  if ((await journalOf(ctx, event._id))?.locked) return { made: 0, more: false };
  const pages = await pagesOf(ctx, event._id);
  let made = 0;
  let more = false;
  for (const page of pages) {
    if (page.edited || page.momentId === undefined || page.locked) continue;
    if (made >= PAGE_BATCH) {
      more = true;
      break;
    }
    if (await refreshOne(ctx, event, page, false)) made++;
  }
  return { made, more };
}

// Brings pages up to their moments. With a page, that page, even if the owner
// has saved it. Without one, every untouched stale page, and the rest follows.
const refresh = mutation({
  args: { eventId: v.id("events"), pageId: v.optional(v.id("journalPages")) },
  handler: async (ctx, args): Promise<number> => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) {
      throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
    }
    if (args.pageId !== undefined) {
      const { page } = await editablePage(ctx, args.pageId);
      if (page.eventId !== event._id) throw notFound();
      return (await refreshOne(ctx, event, page, true)) ? 1 : 0;
    }
    const { made, more } = await refreshBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.model.journal.refreshPages, { eventId: event._id });
    return made;
  },
});

// The next batch of untouched pages. Scheduled from `refresh` until the book
// has caught up or nothing untouched is still stale.
export const refreshPages = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get("events", args.eventId);
    if (event === null || event.status === "archived") return null;
    const { more } = await refreshBatch(ctx, event);
    if (more) await ctx.scheduler.runAfter(0, internal.model.journal.refreshPages, { eventId: event._id });
    return null;
  },
});

// Where a page goes between two others (or after the last).
const between = (before: number | undefined, after: number | undefined) =>
  before === undefined ? (after === undefined ? 0 : after - 60_000) : after === undefined ? before + 60_000 : (before + after) / 2;

// A page after `after` (or at the end): blank, or with `elements` on it (a
// ready-made page idea).
const addPage = mutation({
  args: {
    eventId: v.id("events"),
    after: v.optional(v.id("journalPages")),
    paper: v.optional(v.string()),
    elements: v.optional(v.array(vElement)),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
    if (args.paper !== undefined && !PAPER_SET.has(args.paper)) invalid("paper", "That paper doesn't exist.");
    const pages = await pagesOf(ctx, event._id);
    if (pages.length >= MAX_JOURNAL_PAGES) throw new ConvexError({ code: "FULL", message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.` });
    const at = args.after === undefined ? pages.length - 1 : pages.findIndex((p) => p._id === args.after);
    const order = between(pages[at]?.order, pages[at + 1]?.order);
    const elements = args.elements === undefined ? [] : await encodeElements(ctx, event, args.elements);
    return await insertPage(ctx, event._id, { order, paper: args.paper ?? "cream", elements }, userId);
  },
});

const removePage = mutation({
  args: { pageId: v.id("journalPages") },
  handler: async (ctx, args) => {
    const { page } = await editablePage(ctx, args.pageId);
    await ctx.db.delete("journalPages", page._id);
    return null;
  },
});

// Moves a page to just before `before`, or to the end.
const movePage = mutation({
  args: { pageId: v.id("journalPages"), before: v.union(v.id("journalPages"), v.null()) },
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId);
    const others = (await pagesOf(ctx, event._id)).filter((p) => p._id !== page._id);
    const at = args.before === null ? others.length : others.findIndex((p) => p._id === args.before);
    if (at < 0) throw notFound();
    await ctx.db.patch("journalPages", page._id, { order: between(others[at - 1]?.order, others[at]?.order) });
    return null;
  },
});

// Locks or unlocks one page, or with no page, the whole journal.
const setLock = mutation({
  args: { eventId: v.id("events"), pageId: v.optional(v.id("journalPages")), locked: v.boolean() },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if (args.pageId !== undefined) {
      const { page } = await editablePage(ctx, args.pageId, true);
      if (page.eventId !== event._id) throw notFound();
      await ctx.db.patch("journalPages", page._id, { locked: args.locked || undefined });
      return null;
    }
    const journal = await journalOf(ctx, event._id);
    if (journal === null) await ctx.db.insert("journals", { eventId: event._id, locked: args.locked || undefined });
    else await ctx.db.patch("journals", journal._id, { locked: args.locked || undefined });
    // Pages refused while the book was locked are still owed. Unlocking cuts them.
    if (journal?.locked && !args.locked) await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return null;
  },
});

// Pages from a journal file, added at the end. What doesn't belong to this
// experience (a photo from another one, a style that no longer exists) is
// left off rather than refused, so an old file still comes in.
const importPages = mutation({
  args: { eventId: v.id("events"), pages: v.array(v.object({ paper: v.string(), elements: v.array(vElement) })) },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) throw new ConvexError({ code: "LOCKED", message: "This journal is locked. Unlock it to change it." });
    const pages = await pagesOf(ctx, event._id);
    if (pages.length + args.pages.length > MAX_JOURNAL_PAGES) {
      throw new ConvexError({ code: "FULL", message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.` });
    }
    let order = pages.at(-1)?.order ?? 0;
    for (const p of args.pages) {
      order += 60_000;
      await insertPage(
        ctx,
        event._id,
        {
          order,
          paper: PAPER_SET.has(p.paper) ? p.paper : "cream",
          elements: await encodeElements(ctx, event, p.elements.slice(0, MAX_PAGE_ELEMENTS), true),
        },
        userId,
      );
    }
    return args.pages.length;
  },
});

// Keeps an uploaded picture (a cut-out, or any picture put on a page) as the
// journal's: on its shelf, and visible to everyone who can see the journal.
const keepSticker = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.eventId === undefined) throw notFound();
    const { userId, event } = await requireEventAccess(ctx, media.eventId, "owner");
    assertNotArchived(event);
    if (media.uploaderId !== userId || media.status !== "ready" || media.momentId !== undefined || !IMAGE_MIME_TYPES.includes(media.mime)) {
      invalid("mediaId", "Only a picture you just added can go in the journal.");
    }
    await ctx.db.patch("media", media._id, { purpose: "sticker" });
    return null;
  },
});

// Takes a sticker off the shelf. Refused while any page still shows it, so a
// sticker on two pages survives being taken off one. The caller then deletes
// the stored object the same way a moment drops a photo.
const dropSticker = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.eventId === undefined) throw notFound();
    const { userId, event } = await requireEventAccess(ctx, media.eventId, "owner");
    assertNotArchived(event);
    if (media.uploaderId !== userId || media.purpose !== "sticker" || media.status !== "ready") {
      invalid("mediaId", "That sticker isn't on the shelf.");
    }
    if (await mediaOnAPage(ctx, event._id, media._id)) {
      throw new ConvexError({ code: "IN_USE", message: "This sticker is still on a page. Take it off the page first." });
    }
    return null;
  },
});

// The stickers on an experience's shelf, newest first.
const stickers = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const ready = await ctx.db
      .query("media")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", event._id).eq("status", "ready"))
      .order("desc")
      .take(2000);
    return ready.filter((m) => m.purpose === "sticker").slice(0, 200).map((m) => m._id);
  },
});

// Who may ask for a preview: the journal's owner.
export const previewer = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    return userId;
  },
});

// What a link looks like as a card: its title, description, picture and site,
// read from the page's first 256 KB. A page that can't be read gives just the
// address, so the card still has something on it.
const linkPreview = action({
  args: { eventId: v.id("events"), url: v.string() },
  handler: async (ctx, args): Promise<LinkPreview> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.model.journal.previewer, { eventId: args.eventId });
    let url: URL;
    try {
      url = new URL(args.url.trim());
    } catch {
      throw new ConvexError({ code: "INVALID", message: "That isn't a web address." });
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || args.url.length > 2000) {
      throw new ConvexError({ code: "INVALID", message: "That isn't a web address." });
    }
    const { ok } = await rateLimiter.limit(ctx, "enrich", { key: userId });
    if (!ok) throw new ConvexError({ code: "RATE_LIMITED", message: "That's a lot of links this hour. Try again a little later." });
    const read = await ctx.runAction(internal.model.ai.publicFetch.fetchPage, { url: url.href, limit: 256 * 1024 });
    if (read === null) return { url: url.href, site: url.hostname.replace(/^www\./, "") };
    return previewFromHtml(read.html, read.url);
  },
});

// What the app calls. Registered once, by convex/api/journal.ts, which re-exports it.
export const journalApi = { outline, page, pageForMoment, get, fill, unpaged, savePage, refresh, addPage, removePage, movePage, setLock, importPages, keepSticker, dropSticker, stickers, linkPreview };
