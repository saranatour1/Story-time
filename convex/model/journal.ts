import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { action, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { patchMedia } from "../lib/aggregates";
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
  withinPageReach,
  PAPERS,
  PRINT_STYLES,
  tripDates,
  readLink,
  TITLE_STYLES,
  TONES,
} from "../lib/journal";
import { IMAGE_MIME_TYPES, momentsToRead } from "../lib/limits";
import { limitWrites, rateLimiter } from "../lib/rateLimit";
import { type LinkPreview, previewFromHtml } from "./ai/unfurl";
import { viewMoment } from "./moments";
import { vJournalKind } from "../schema";

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

const fromLayout = (elements: JournalElement[]): ElementIn[] =>
  elements.map((e) => ({
    ...e,
    mediaId: e.mediaId as Id<"media"> | undefined,
    momentId: e.momentId as Id<"moments"> | undefined,
  }));

export const vPageView = v.object({
  _id: v.id("journalPages"),
  order: v.number(),
  paper: v.string(),
  locked: v.boolean(),
  momentId: v.optional(v.id("moments")),
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

const notFound = () =>
  new ConvexError({ code: "NOT_FOUND", message: "That page isn't here any more." });

const journalOf = async (ctx: QueryCtx, eventId: Id<"events">) => {
  return ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
};

const pagesOf = async (ctx: QueryCtx, eventId: Id<"events">) => {
  return ctx.db
    .query("journalPages")
    .withIndex("by_event_and_order", (q) => q.eq("eventId", eventId))
    .take(MAX_JOURNAL_PAGES + 1);
};

export const mediaOnAPage = async (ctx: QueryCtx, eventId: Id<"events">, mediaId: Id<"media">) => {
  const pages = await pagesOf(ctx, eventId);
  return pages.some((page) => page.elements.some((element) => element.mediaId === mediaId));
};

const editablePage = async (ctx: MutationCtx, pageId: Id<"journalPages">, unlocking = false) => {
  const page = await ctx.db.get("journalPages", pageId);
  if (page === null) throw notFound();
  const { userId, event } = await requireEventAccess(ctx, page.eventId, "owner");
  assertNotArchived(event);
  await limitWrites(ctx, userId);
  const journal = await journalOf(ctx, event._id);
  if (journal?.locked)
    throw new ConvexError({
      code: "LOCKED",
      message: "This journal is locked. Unlock it to change it.",
    });
  if (page.locked && !unlocking)
    throw new ConvexError({
      code: "LOCKED",
      message: "This page is locked. Unlock it to change it.",
    });
  return { page, event };
};

const encodeElements = async (
  ctx: QueryCtx,
  event: Doc<"events">,
  elements: ElementIn[],
  drop = false,
): Promise<Doc<"journalPages">["elements"]> => {
  if (elements.length > MAX_PAGE_ELEMENTS)
    invalid("elements", `A page holds up to ${MAX_PAGE_ELEMENTS} things.`);
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
  const problemWith = async (e: ElementIn): Promise<string | undefined> => {
    if (e.id.length === 0 || e.id.length > 40 || seen.has(e.id))
      return "Each thing on a page needs its own id.";
    if (![e.x, e.y, e.w, e.h, e.z].every(withinPageReach) || !Number.isFinite(e.rotation))
      return "That doesn't fit on a page.";
    if (e.w < 4 || e.h < 4) return "That is too small to see.";
    const styles = STYLES[e.kind];
    if (e.style !== undefined && (styles === null || !styles.has(e.style)))
      return `There is no ${e.kind} style called "${e.style}".`;
    if (e.tone !== undefined && !TONE_SET.has(e.tone)) return "That tone doesn't exist.";
    const most =
      e.kind === "drawing"
        ? MAX_DRAWING_TEXT
        : e.kind === "link"
          ? MAX_LINK_TEXT
          : MAX_ELEMENT_TEXT;
    if (e.text !== undefined && e.text.length > most)
      return e.kind === "drawing"
        ? "That drawing is too big. Start another one."
        : `Words on a page are at most ${most} characters.`;
    if ((e.kind === "drawing" || e.kind === "link") && !e.text?.trim())
      return e.kind === "drawing" ? "A drawing needs its strokes." : "A link needs its address.";
    if (e.kind === "link" && !readLink(e.text)) return "A link needs a web address.";
    if (e.color !== undefined && !/^#[0-9a-f]{6}$/i.test(e.color)) return "That colour isn't one.";
    const pictured = e.kind === "photo" || e.kind === "sticker";
    if (pictured !== (e.mediaId !== undefined))
      return pictured ? "A photo needs a picture." : "Only photos and stickers show a picture.";
    if (e.mediaId !== undefined) {
      const m = await mediaOf(e.mediaId);
      const ok =
        m !== null &&
        m.eventId === event._id &&
        m.status === "ready" &&
        m.mime.startsWith("image/") &&
        (e.kind === "sticker"
          ? m.purpose === "sticker"
          : m.momentId !== undefined || m.purpose === "sticker");
      if (!ok) return "That photo isn't in this experience.";
    }
    if ((e.kind === "map") !== (e.momentId !== undefined))
      return e.kind === "map" ? "A map shows a moment's stops." : "Only a map points at a moment.";
    if (e.momentId !== undefined) {
      const m = await momentOf(e.momentId);
      if (m === null || m.eventId !== event._id) return "That moment isn't in this experience.";
    }
    return undefined;
  };
  for (const e of elements) {
    const problem = await problemWith(e);
    if (problem !== undefined) {
      if (drop) continue;
      invalid("elements", problem);
    }
    seen.add(e.id);
    const text =
      e.text === undefined || e.text.trim() === ""
        ? undefined
        : await encryptText(event._id, event.keyVersion, e.text);
    out.push({ ...e, rotation: e.rotation % 360, text });
  }
  return out;
};

const catchUpState = async (ctx: QueryCtx, page: Doc<"journalPages">) => {
  const edited = page.edited ?? false;
  if (page.momentId === undefined) return { edited, stale: false, gone: false };
  const moment = await ctx.db.get("moments", page.momentId);
  if (moment === null) return { edited, stale: false, gone: true };
  const stamp = moment.lastEdit?.at ?? moment._creationTime;
  return { edited, stale: page.builtFrom !== undefined && page.builtFrom !== stamp, gone: false };
};

const withoutLinkImage = (text: string): string => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !("image" in parsed)
    )
      return text;
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== "image") copy[key] = value;
    }
    return JSON.stringify(copy);
  } catch {
    return text;
  }
};

const withoutPictures = (elements: Infer<typeof vElement>[]): Infer<typeof vElement>[] => {
  const kept: Infer<typeof vElement>[] = [];
  for (const element of elements) {
    if (element.kind === "photo" || element.kind === "sticker" || element.mediaId !== undefined)
      continue;
    if (element.kind === "link" && element.text !== undefined) {
      kept.push({ ...element, text: withoutLinkImage(element.text) });
      continue;
    }
    kept.push(element);
  }
  return kept;
};

const viewPage = async (
  ctx: QueryCtx,
  event: Doc<"events">,
  page: Doc<"journalPages">,
  redact = false,
) => {
  const elements = await Promise.all(
    page.elements.map(async (e) => ({
      ...e,
      text: e.text === undefined ? undefined : await decryptText(event._id, e.text),
    })),
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
};

const pendingOf = async (ctx: QueryCtx, event: Doc<"events">, journal: Doc<"journals"> | null) => {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  let pending = moments.filter(
    (m) => journal?.filledAt === undefined || m._creationTime > journal.filledAt,
  ).length;
  if (journal === null) pending = Math.max(pending, 1);
  return pending;
};

const labelOf = async (event: Doc<"events">, page: Doc<"journalPages">) => {
  const text = page.elements.find(
    (e) => (e.kind === "title" || e.kind === "note") && e.text !== undefined,
  )?.text;
  if (text === undefined) return "";
  return (await decryptText(event._id, text)).replace(/\s+/g, " ").trim().slice(0, 80);
};

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

const outline = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const canEdit = role === "owner" && event.status !== "archived";
    const pending = canEdit && !journal?.locked ? await pendingOf(ctx, event, journal) : 0;
    return {
      canEdit,
      locked: journal?.locked ?? false,
      pending,
      pages: await contentsOf(ctx, event),
    };
  },
});

export const contentsOf = async (ctx: QueryCtx, event: Doc<"events">) => {
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
};

export const pageInEvent = async (
  ctx: QueryCtx,
  event: Doc<"events">,
  pageId: Id<"journalPages">,
  redact = false,
) => {
  const row = await ctx.db.get("journalPages", pageId);
  if (row === null || row.eventId !== event._id) return null;
  return await viewPage(ctx, event, row, redact);
};

const page = query({
  args: { pageId: v.id("journalPages") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("journalPages", args.pageId);
    if (row === null) return null;
    const { event } = await requireEventAccess(ctx, row.eventId, "viewer");
    return await viewPage(ctx, event, row);
  },
});

const pageForMoment = query({
  args: { eventId: v.id("events"), momentId: v.optional(v.id("moments")) },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const row =
      args.momentId === undefined
        ? (await pagesOf(ctx, event._id))[0]
        : await ctx.db
            .query("journalPages")
            .withIndex("by_event_and_moment", (q) =>
              q.eq("eventId", event._id).eq("momentId", args.momentId),
            )
            .first();
    return row === undefined || row === null ? null : await viewPage(ctx, event, row);
  },
});

const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const canEdit = role === "owner" && event.status !== "archived";
    const pending = canEdit && !journal?.locked ? await pendingOf(ctx, event, journal) : 0;
    const pages = await Promise.all(
      (await pagesOf(ctx, event._id))
        .slice(0, MAX_JOURNAL_PAGES)
        .map((p) => viewPage(ctx, event, p)),
    );
    return { canEdit, locked: journal?.locked ?? false, pending, pages };
  },
});

const PAGE_BATCH = 20;

const insertPage = async (
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
) => {
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
};

const makePageBatch = async (
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<{ made: number; more: boolean }> => {
  const existing = await journalOf(ctx, event._id);
  if (existing?.locked) return { made: 0, more: false };
  const rows = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  if (existing === null && rows.length === 0) return { made: 0, more: false };

  const created =
    existing ??
    (await ctx.db.get("journals", await ctx.db.insert("journals", { eventId: event._id })));
  if (created === null) throw new Error("Journal missing");
  const journal = created;
  const fresh = rows.filter(
    (m) => journal.filledAt === undefined || m._creationTime > journal.filledAt,
  );
  let room = MAX_JOURNAL_PAGES - (await pagesOf(ctx, event._id)).length;
  let made = 0;
  let more = false;

  if (existing === null && room > 0) {
    const views = [await viewMoment(ctx, event, rows[0]!)];
    const photo = [views[0]!.blocks, ...views[0]!.stops.map((s) => s.blocks)]
      .flat()
      .find((b) => b.type === "photo");
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
};

export const makePages = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get("events", args.eventId);
    if (event === null || event.status === "archived") return null;
    const { more } = await makePageBatch(ctx, event);
    if (more)
      await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return null;
  },
});

export const backfillWaiting = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db
      .query("events")
      .paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const event of page.page) {
      if (event.status === "archived") continue;
      await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.model.journal.backfillWaiting, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

const fill = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<number> => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const { made, more } = await makePageBatch(ctx, event);
    if (more)
      await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return made;
  },
});

const unpaged = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await journalOf(ctx, event._id);
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(momentsToRead(event.momentCount));
    const waiting = moments.filter(
      (m) => journal?.filledAt === undefined || m._creationTime > journal.filledAt,
    );
    if (waiting.length === 0 || (await pagesOf(ctx, event._id)).length < MAX_JOURNAL_PAGES)
      return { full: false, momentIds: [] };
    return { full: true, momentIds: waiting.map((m) => m._id) };
  },
});

const wordsOf = (text: string | undefined): string | undefined => {
  if (text === undefined || text.trim() === "") return undefined;
  return text;
};

const lockedStay = async (
  event: Doc<"events">,
  stored: Doc<"journalPages">["elements"],
  incoming: ElementIn[],
) => {
  const byId = new Map(incoming.map((e) => [e.id, e]));
  for (const old of stored) {
    if (old.locked !== true) continue;
    const next = byId.get(old.id);
    if (next === undefined)
      throw new ConvexError({ code: "LOCKED", message: "That is locked in place." });
    const storedText = wordsOf(
      old.text === undefined ? undefined : await decryptText(event._id, old.text),
    );
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
};

const markRetyped = async (
  event: Doc<"events">,
  page: Doc<"journalPages">,
  elements: ElementIn[],
): Promise<ElementIn[]> => {
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
};

const savePage = mutation({
  args: {
    pageId: v.id("journalPages"),
    paper: v.optional(v.string()),
    elements: v.array(vElement),
  },
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId);
    if (args.paper !== undefined && !PAPER_SET.has(args.paper))
      invalid("paper", "That paper doesn't exist.");
    await lockedStay(event, page.elements, args.elements);
    await ctx.db.patch("journalPages", page._id, {
      paper: args.paper ?? page.paper,
      elements: await encodeElements(ctx, event, await markRetyped(event, page, args.elements)),
      edited: true,
    });
    return null;
  },
});

const refreshOne = async (
  ctx: MutationCtx,
  event: Doc<"events">,
  page: Doc<"journalPages">,
  force: boolean,
): Promise<boolean> => {
  if (page.momentId === undefined || page.locked) return false;
  if (page.edited && !force) return false;
  const moment = await ctx.db.get("moments", page.momentId);
  if (moment === null || moment.eventId !== event._id) return false;
  const stamp = moment.lastEdit?.at ?? moment._creationTime;
  if (page.builtFrom === undefined || page.builtFrom === stamp) return false;
  const rows = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(momentsToRead(event.momentCount));
  const view = await viewMoment(ctx, event, moment);
  const spec = momentPage(
    { ...view, stops: view.stops },
    Math.max(
      0,
      rows.findIndex((row) => row._id === moment._id),
    ),
  );
  const fresh = fromLayout(spec.elements);
  const next = page.edited
    ? catchUpElements((await viewPage(ctx, event, page)).elements, fresh, moment._id)
    : fresh;
  await ctx.db.patch("journalPages", page._id, {
    elements: await encodeElements(ctx, event, next, true),
    builtFrom: stamp,
  });
  return true;
};

const refreshBatch = async (
  ctx: MutationCtx,
  event: Doc<"events">,
): Promise<{ made: number; more: boolean }> => {
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
};

const refresh = mutation({
  args: { eventId: v.id("events"), pageId: v.optional(v.id("journalPages")) },
  handler: async (ctx, args): Promise<number> => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked) {
      throw new ConvexError({
        code: "LOCKED",
        message: "This journal is locked. Unlock it to change it.",
      });
    }
    if (args.pageId !== undefined) {
      const { page } = await editablePage(ctx, args.pageId);
      if (page.eventId !== event._id) throw notFound();
      return (await refreshOne(ctx, event, page, true)) ? 1 : 0;
    }
    const { made, more } = await refreshBatch(ctx, event);
    if (more)
      await ctx.scheduler.runAfter(0, internal.model.journal.refreshPages, { eventId: event._id });
    return made;
  },
});

export const refreshPages = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get("events", args.eventId);
    if (event === null || event.status === "archived") return null;
    const { more } = await refreshBatch(ctx, event);
    if (more)
      await ctx.scheduler.runAfter(0, internal.model.journal.refreshPages, { eventId: event._id });
    return null;
  },
});

const between = (before: number | undefined, after: number | undefined) =>
  before === undefined
    ? after === undefined
      ? 0
      : after - 60_000
    : after === undefined
      ? before + 60_000
      : (before + after) / 2;

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
    if ((await journalOf(ctx, event._id))?.locked)
      throw new ConvexError({
        code: "LOCKED",
        message: "This journal is locked. Unlock it to change it.",
      });
    if (args.paper !== undefined && !PAPER_SET.has(args.paper))
      invalid("paper", "That paper doesn't exist.");
    const pages = await pagesOf(ctx, event._id);
    if (pages.length >= MAX_JOURNAL_PAGES)
      throw new ConvexError({
        code: "FULL",
        message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.`,
      });
    const at =
      args.after === undefined ? pages.length - 1 : pages.findIndex((p) => p._id === args.after);
    const order = between(pages[at]?.order, pages[at + 1]?.order);
    const elements =
      args.elements === undefined ? [] : await encodeElements(ctx, event, args.elements);
    return await insertPage(
      ctx,
      event._id,
      { order, paper: args.paper ?? "cream", elements },
      userId,
    );
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

const movePage = mutation({
  args: { pageId: v.id("journalPages"), before: v.union(v.id("journalPages"), v.null()) },
  handler: async (ctx, args) => {
    const { page, event } = await editablePage(ctx, args.pageId);
    const others = (await pagesOf(ctx, event._id)).filter((p) => p._id !== page._id);
    const at =
      args.before === null ? others.length : others.findIndex((p) => p._id === args.before);
    if (at < 0) throw notFound();
    await ctx.db.patch("journalPages", page._id, {
      order: between(others[at - 1]?.order, others[at]?.order),
    });
    return null;
  },
});

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
    if (journal === null)
      await ctx.db.insert("journals", { eventId: event._id, locked: args.locked || undefined });
    else await ctx.db.patch("journals", journal._id, { locked: args.locked || undefined });
    if (journal?.locked && !args.locked)
      await ctx.scheduler.runAfter(0, internal.model.journal.makePages, { eventId: event._id });
    return null;
  },
});

const importPages = mutation({
  args: {
    eventId: v.id("events"),
    pages: v.array(v.object({ paper: v.string(), elements: v.array(vElement) })),
  },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if ((await journalOf(ctx, event._id))?.locked)
      throw new ConvexError({
        code: "LOCKED",
        message: "This journal is locked. Unlock it to change it.",
      });
    const pages = await pagesOf(ctx, event._id);
    if (pages.length + args.pages.length > MAX_JOURNAL_PAGES) {
      throw new ConvexError({
        code: "FULL",
        message: `A journal holds up to ${MAX_JOURNAL_PAGES} pages.`,
      });
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

const keepSticker = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.eventId === undefined) throw notFound();
    const { userId, event } = await requireEventAccess(ctx, media.eventId, "owner");
    assertNotArchived(event);
    if (
      media.uploaderId !== userId ||
      media.status !== "ready" ||
      media.momentId !== undefined ||
      !IMAGE_MIME_TYPES.includes(media.mime)
    ) {
      invalid("mediaId", "Only a picture you just added can go in the journal.");
    }
    await patchMedia(ctx, media._id, { purpose: "sticker" });
    return null;
  },
});

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
      throw new ConvexError({
        code: "IN_USE",
        message: "This sticker is still on a page. Take it off the page first.",
      });
    }
    return null;
  },
});

const stickers = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const ready = await ctx.db
      .query("media")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", event._id).eq("status", "ready"))
      .order("desc")
      .take(2000);
    return ready
      .filter((m) => m.purpose === "sticker")
      .slice(0, 200)
      .map((m) => m._id);
  },
});

export const previewer = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    return userId;
  },
});

const linkPreview = action({
  args: { eventId: v.id("events"), url: v.string() },
  handler: async (ctx, args): Promise<LinkPreview> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.model.journal.previewer, {
      eventId: args.eventId,
    });
    let url: URL;
    try {
      url = new URL(args.url.trim());
    } catch {
      throw new ConvexError({ code: "INVALID", message: "That isn't a web address." });
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || args.url.length > 2000) {
      throw new ConvexError({ code: "INVALID", message: "That isn't a web address." });
    }
    const { ok } = await rateLimiter.limit(ctx, "linkPreview", { key: userId });
    if (!ok)
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "That's a lot of links this hour. Try again a little later.",
      });
    const read = await ctx.runAction(internal.model.ai.publicFetch.fetchPage, {
      url: url.href,
      limit: 256 * 1024,
    });
    if (read === null) return { url: url.href, site: url.hostname.replace(/^www\./, "") };
    return previewFromHtml(read.html, read.url);
  },
});

export const journalApi = {
  outline,
  page,
  pageForMoment,
  get,
  fill,
  unpaged,
  savePage,
  refresh,
  addPage,
  removePage,
  movePage,
  setLock,
  importPages,
  keepSticker,
  dropSticker,
  stickers,
  linkPreview,
};
