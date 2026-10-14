import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { decryptText, encryptText } from "./crypto";
import { MAX_JOURNAL_PAGES, tripDates } from "./journal";

// The words on a journal's cover that follow the trip until someone retypes
// them: its name, and its dates. Kept apart from journal.ts so the moment
// writes can use it too without the two importing each other.

export type CoverWords = { title: string; dates: string | undefined };

// The trip's name as the cover prints it.
export const coverTitle = (event: Doc<"events">) => (event.title || "Our trip").slice(0, 60);

// The date line the cover is given: the trip's dates, or its first moment to
// its last when it has none. At most two reads, one at each end of the index.
export const coverDates = async (
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<string | undefined> => {
  const moments = () =>
    ctx.db.query("moments").withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id));
  const first = event.startsAt === undefined ? ((await moments().first()) ?? undefined) : undefined;
  const last =
    event.endsAt === undefined ? ((await moments().order("desc").first()) ?? undefined) : undefined;
  return tripDates(event, first, last);
};

export const coverWords = async (ctx: QueryCtx, event: Doc<"events">): Promise<CoverWords> => {
  return { title: coverTitle(event), dates: await coverDates(ctx, event) };
};

// Until the owner retypes the cover, its name and dates follow the trip. A
// line that no longer says what was last written is theirs, and stays.
export const followCover = async (
  ctx: MutationCtx,
  event: Doc<"events">,
  before: CoverWords,
  after: CoverWords,
): Promise<void> => {
  if (before.title === after.title && before.dates === after.dates) return;
  const journal = await ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .unique();
  if (journal === null || journal.locked) return;
  const pages = await ctx.db
    .query("journalPages")
    .withIndex("by_event_and_order", (q) => q.eq("eventId", event._id))
    .take(MAX_JOURNAL_PAGES);
  for (const page of pages) {
    if (page.locked || !page.elements.some((e) => e.id.startsWith("cover-"))) continue;
    let changed = false;
    const elements = [];
    for (const element of page.elements) {
      if (
        element.kind !== "title" ||
        element.text === undefined ||
        !element.id.startsWith("cover-")
      ) {
        elements.push(element);
        continue;
      }
      const plain = await decryptText(event._id, element.text);
      const next =
        plain === before.title && after.title !== before.title
          ? after.title
          : before.dates !== undefined &&
              after.dates !== undefined &&
              plain === before.dates &&
              after.dates !== before.dates
            ? after.dates
            : undefined;
      if (next === undefined) {
        elements.push(element);
        continue;
      }
      elements.push({ ...element, text: await encryptText(event._id, event.keyVersion, next) });
      changed = true;
    }
    if (changed) await ctx.db.patch("journalPages", page._id, { elements });
  }
};

// Around a write that may move a dateless trip's first or last moment: the
// cover's date line before it, then `after()` to follow it. A trip with both
// dates set never changes this way, so it costs nothing there.
export const datesBefore = async (
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<(ctx: MutationCtx) => Promise<void>> => {
  if (event.startsAt !== undefined && event.endsAt !== undefined) return async () => undefined;
  const before = await coverWords(ctx, event);
  return async (mctx) =>
    followCover(mctx, event, before, { title: before.title, dates: await coverDates(mctx, event) });
};
