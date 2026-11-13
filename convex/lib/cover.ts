import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { decryptText, encryptText } from "./crypto";
import { MAX_JOURNAL_PAGES, tripDates } from "./journal";

export type CoverWords = { title: string; dates: string | undefined };

export const coverTitle = (event: Doc<"events">) => (event.title || "Our trip").slice(0, 60);

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

export const coverDatesFollowUp = async (
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<(ctx: MutationCtx) => Promise<void>> => {
  if (event.startsAt !== undefined && event.endsAt !== undefined) return async () => undefined;
  const before = await coverWords(ctx, event);
  return async (mctx) =>
    followCover(mctx, event, before, { title: before.title, dates: await coverDates(mctx, event) });
};
