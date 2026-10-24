/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import { isPublicWebUrl, previewFromHtml, publicRedirect } from "../model/ai/unfurl";
import {
  catchUpElements,
  coverPage,
  type JournalElement,
  momentPage,
  PAGE,
  rangeLabel,
  readLink,
  tripDates,
} from "../lib/journal";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const invitesModules = import.meta.glob([
  "../components/invites/**/*.ts",
  "../components/invites/**/*.js",
]);
const emailModules = import.meta.glob([
  "../components/email/**/*.ts",
  "../components/email/**/*.js",
]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});
// Pages are scheduled with a zero delay. Hold them until a test asks, so a
// fill that runs in the same turn is still the call that cuts the pages.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const JUNE_1 = Date.UTC(2026, 5, 1, 12);

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, viewerId, otherId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await owner.mutation(api.api.events.update, { eventId, title: "A week in Lisbon" });
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  const photo = async (who = owner, event = eventId) => {
    const { mediaId } = await who.mutation(api.api.media.reserveUpload, {
      eventId: event,
      size: 100,
      mime: "image/png",
    });
    await who.mutation(api.api.media.confirmUpload, { mediaId });
    return mediaId;
  };
  const moment = async (startsAt: number, text: string, mediaId?: Id<"media">) =>
    owner.mutation(api.api.moments.create, {
      eventId,
      startsAt,
      tzOffsetMinutes: 0,
      place: "Lisbon, Portugal",
      blocks: [...(mediaId ? [{ type: "photo" as const, mediaId }] : []), { type: "note", text }],
    });
  return { t, owner, viewer: as(viewerId), other: as(otherId), eventId, photo, moment };
};

type ElementArg = FunctionArgs<typeof api.api.journal.savePage>["elements"][number];
const element = (over: Partial<ElementArg> = {}): ElementArg => ({
  id: "e1",
  kind: "title" as const,
  x: 10,
  y: 10,
  w: 300,
  h: 80,
  rotation: 0,
  z: 1,
  style: "typewriter",
  text: "Hello",
  ...over,
});

describe("laying out pages", () => {
  test("a moment's page has its title, postmark, photos with tape and words, all on the page", () => {
    const page = momentPage(
      {
        _id: "m1",
        startsAt: JUNE_1,
        place: "Lisbon, Portugal",
        blocks: [
          { type: "photo", mediaId: "p1" },
          { type: "photo", mediaId: "p2" },
          { type: "note", text: "Pastéis" },
        ],
        stops: [],
      },
      0,
    );
    const kinds = page.elements.map((e) => e.kind);
    expect(kinds.filter((k) => k === "photo")).toHaveLength(2);
    expect(page.elements.find((e) => e.kind === "title")?.text).toBe("Lisbon");
    expect(page.elements.find((e) => e.kind === "note")?.text).toBe("Pastéis");
    expect(page.elements.some((e) => e.kind === "deco" && e.style === "postmark")).toBe(true);
    expect(new Set(page.elements.map((e) => e.id)).size).toBe(page.elements.length);
    for (const e of page.elements.filter((e) => e.kind !== "deco")) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(PAGE.w);
      expect(e.y + e.h).toBeLessThanOrEqual(PAGE.h);
    }
  });

  test("the same moment lays out the same; a journey gets a map", () => {
    const m = {
      _id: "m2",
      startsAt: JUNE_1,
      geo: { lat: 38.7, lng: -9.1 },
      blocks: [{ type: "note", text: "Off we go" }],
      stops: [{ place: "Sintra", geo: { lat: 38.8, lng: -9.4 }, blocks: [] }],
    };
    expect(momentPage(m, 3)).toEqual(momentPage(m, 3));
    expect(momentPage(m, 3).elements.find((e) => e.kind === "map")?.momentId).toBe("m2");
  });

  test("a moment with only words gets no empty prints or stray tape", () => {
    const page = momentPage(
      { _id: "m3", startsAt: JUNE_1, blocks: [{ type: "note", text: "Just words" }], stops: [] },
      1,
    );
    expect(page.elements.filter((e) => e.kind === "photo")).toEqual([]);
    expect(page.elements.filter((e) => e.kind === "deco" && e.style?.startsWith("tape"))).toEqual(
      [],
    );
    expect(page.elements.find((e) => e.kind === "note")?.text).toBe("Just words");
  });

  test("the cover carries the title, dates and the first photo", () => {
    const cover = coverPage({
      id: "ev",
      title: "A week in Lisbon",
      dates: "1 Jun – 7 Jun 2026",
      photo: "p1",
    });
    expect(cover.elements.filter((e) => e.kind === "title").map((e) => e.text)).toEqual([
      "A week in Lisbon",
      "1 Jun – 7 Jun 2026",
    ]);
    expect(cover.elements.find((e) => e.kind === "photo")?.mediaId).toBe("p1");
  });

  test("catching up replaces the layout and keeps what the owner added", () => {
    const fresh = momentPage(
      { _id: "moment1", startsAt: JUNE_1, blocks: [{ type: "note", text: "Better" }], stops: [] },
      0,
    ).elements;
    const old = fresh.map((e) => (e.kind === "note" ? { ...e, text: "Old" } : e));
    const sticker: JournalElement = {
      id: "mine",
      kind: "sticker",
      x: 12,
      y: 12,
      w: 40,
      h: 40,
      rotation: 0,
      z: 40,
    };
    const merged = catchUpElements([...old, sticker], fresh, "moment1");
    expect(merged.find((e) => e.kind === "note")?.text).toBe("Better");
    expect(merged.find((e) => e.id === "mine")).toEqual(sticker);
    expect(merged.filter((e) => e.kind === "note")).toHaveLength(1);
    const locked = old.find((e) => e.kind === "note");
    const kept = catchUpElements([{ ...locked!, locked: true }, sticker], fresh, "moment1");
    expect(kept.find((e) => e.kind === "note")?.text).toBe("Old");
    expect(kept.filter((e) => e.kind === "note")).toHaveLength(1);
  });

  test("a layout piece whose words the owner changed is theirs and stays", () => {
    const fresh = momentPage(
      {
        _id: "moment1",
        startsAt: JUNE_1,
        place: "Lisbon, Portugal",
        blocks: [{ type: "note", text: "Better" }],
        stops: [],
      },
      0,
    ).elements;
    const retitled = fresh.map((e) =>
      e.kind === "title"
        ? { ...e, text: "Our best day", own: true }
        : e.kind === "note"
          ? { ...e, text: "Old" }
          : e,
    );
    const merged = catchUpElements(retitled, fresh, "moment1");
    expect(merged.filter((e) => e.kind === "title").map((e) => e.text)).toEqual(["Our best day"]);
    expect(merged.find((e) => e.kind === "note")?.text).toBe("Better");
  });

  test("a cover's dates are the trip's calendar days, or the days its moments happened where they happened", () => {
    // 07:10 on 1 April in Tokyo is still 31 March in UTC.
    const tokyo = { startsAt: Date.UTC(2025, 2, 31, 22, 10), tzOffsetMinutes: 540 };
    const osaka = { startsAt: Date.UTC(2025, 3, 10, 4, 40), tzOffsetMinutes: 540 };
    expect(tripDates({}, tokyo, osaka)).toBe("1 Apr – 10 Apr 2025");
    // Saved at local midnight in UTC+3 and in UTC−5: the same calendar days.
    expect(
      tripDates({ startsAt: Date.UTC(2025, 2, 31, 21), endsAt: Date.UTC(2025, 3, 9, 21) }),
    ).toBe("1 Apr – 10 Apr 2025");
    expect(tripDates({ startsAt: Date.UTC(2025, 3, 1, 5), endsAt: Date.UTC(2025, 3, 10, 5) })).toBe(
      "1 Apr – 10 Apr 2025",
    );
    // Local midnight in UTC+13 and just east of UTC+12 (Chatham, UTC+12:45).
    expect(
      tripDates({ startsAt: Date.UTC(2025, 2, 31, 11), endsAt: Date.UTC(2025, 3, 9, 11) }),
    ).toBe("1 Apr – 10 Apr 2025");
    expect(
      tripDates({ startsAt: Date.UTC(2025, 2, 31, 11, 15), endsAt: Date.UTC(2025, 3, 9, 11, 15) }),
    ).toBe("1 Apr – 10 Apr 2025");
    // Hawaii, UTC−10, keeps the day it picked. UTC+12 still rounds onto that day.
    expect(
      tripDates({ startsAt: Date.UTC(2025, 3, 1, 10), endsAt: Date.UTC(2025, 3, 10, 10) }),
    ).toBe("1 Apr – 10 Apr 2025");
    expect(
      tripDates({ startsAt: Date.UTC(2025, 2, 31, 12), endsAt: Date.UTC(2025, 3, 9, 12) }),
    ).toBe("1 Apr – 10 Apr 2025");
    expect(tripDates({})).toBeUndefined();
  });

  test("dates read as a range, or one day", () => {
    expect(rangeLabel(JUNE_1, JUNE_1 + 6 * 86_400_000)).toBe("1 Jun – 7 Jun 2026");
    expect(rangeLabel(JUNE_1, JUNE_1 + 3_600_000)).toBe("1 Jun 2026");
  });
});

describe("filling a journal", () => {
  test("a new journal gets a cover and a page for each moment, once", async () => {
    const { owner, eventId, photo, moment } = await setup();
    const p = await photo();
    await moment(JUNE_1, "Pastéis by the river", p);
    await moment(JUNE_1 + 86_400_000, "Sintra in the fog");
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBeGreaterThan(0);

    expect(await owner.mutation(api.api.journal.fill, { eventId })).toBe(3);
    const journal = await owner.query(api.api.journal.get, { eventId });
    expect(journal.pending).toBe(0);
    expect(journal.pages).toHaveLength(3);
    expect(journal.pages[0]!.momentId).toBeUndefined();
    expect(journal.pages[0]!.elements.find((e) => e.kind === "title")?.text).toBe(
      "A week in Lisbon",
    );
    expect(journal.pages[1]!.elements.find((e) => e.kind === "note")?.text).toBe(
      "Pastéis by the river",
    );

    // A second window filling at the same time makes nothing twice.
    expect(await owner.mutation(api.api.journal.fill, { eventId })).toBe(0);
  });

  test("a moment made later gets its page, and a page taken out stays out", async () => {
    const { owner, eventId, moment } = await setup();
    await moment(JUNE_1, "First");
    await owner.mutation(api.api.journal.fill, { eventId });
    const [, first] = (await owner.query(api.api.journal.get, { eventId })).pages;
    await owner.mutation(api.api.journal.removePage, { pageId: first!._id });

    await moment(JUNE_1 - 86_400_000, "Earlier, added later");
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBe(1);
    expect(await owner.mutation(api.api.journal.fill, { eventId })).toBe(1);
    const pages = (await owner.query(api.api.journal.get, { eventId })).pages;
    expect(pages.map((p) => p.elements.find((e) => e.kind === "note")?.text)).toEqual([
      undefined,
      "Earlier, added later",
    ]);
  });

  test("a full book does not mark moments that never got a page as done", async () => {
    const { t, owner, eventId, moment } = await setup();
    await moment(JUNE_1, "Already");
    await owner.mutation(api.api.journal.fill, { eventId });
    await t.run(async (ctx) => {
      const count = (await ctx.db.query("journalPages").take(500)).length;
      for (let i = count; i < 400; i++) {
        await ctx.db.insert("journalPages", {
          eventId,
          order: 1_000_000 + i,
          paper: "cream",
          elements: [],
        });
      }
    });
    await moment(JUNE_1 + 86_400_000, "Left out");
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBe(1);
    expect(await owner.mutation(api.api.journal.fill, { eventId })).toBe(0);
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBe(1);
  });

  test("the open book reads one page, and the contents list stays short", async () => {
    const { owner, eventId, moment } = await setup();
    const momentId = await moment(JUNE_1, "Pastéis by the river");
    await owner.mutation(api.api.journal.fill, { eventId });
    const outline = await owner.query(api.api.journal.outline, { eventId });
    expect(outline.pages.map((p) => p.label)).toEqual(["A week in Lisbon", "Lisbon"]);
    expect(outline.pages[1]).not.toHaveProperty("elements");
    const one = await owner.query(api.api.journal.page, { pageId: outline.pages[1]!._id });
    expect(one?.elements.find((e) => e.kind === "note")?.text).toBe("Pastéis by the river");
    expect((await owner.query(api.api.journal.pageForMoment, { eventId, momentId }))?._id).toBe(
      outline.pages[1]!._id,
    );
    await owner.mutation(api.api.journal.removePage, { pageId: outline.pages[1]!._id });
    expect(await owner.query(api.api.journal.pageForMoment, { eventId, momentId })).toBeNull();
  });

  test("a moment gets its page without anyone opening the journal", async () => {
    const { t, owner, other, eventId, moment } = await setup();
    const first = await moment(JUNE_1, "Pastéis by the river");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const journal = await owner.query(api.api.journal.get, { eventId });
    expect(journal.pending).toBe(0);
    expect(journal.pages.map((p) => p.momentId)).toEqual([undefined, first]);
    expect(journal.pages[0]!.elements.find((e) => e.kind === "title")?.text).toBe(
      "A week in Lisbon",
    );

    await moment(JUNE_1 + 86_400_000, "Sintra in the fog");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const again = await owner.query(api.api.journal.get, { eventId });
    expect(again.pages).toHaveLength(3);
    expect(again.pages.filter((p) => p.momentId === undefined)).toHaveLength(1);

    await t.mutation(internal.model.journal.makePages, { eventId });
    expect((await owner.query(api.api.journal.get, { eventId })).pages).toHaveLength(3);
    await expect(other.query(api.api.journal.unpaged, { eventId })).rejects.toThrow();
  });

  test("a long run of moments is paged in batches", async () => {
    const { t, owner, eventId, moment } = await setup();
    for (let i = 0; i < 25; i++) await moment(JUNE_1 + i * 3_600_000, `Hour ${i}`);
    await t.mutation(internal.model.journal.makePages, { eventId });
    const mid = await owner.query(api.api.journal.get, { eventId });
    expect(mid.pages).toHaveLength(20);
    expect(mid.pending).toBeGreaterThan(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const journal = await owner.query(api.api.journal.get, { eventId });
    expect(journal.pages).toHaveLength(26);
    expect(journal.pending).toBe(0);
    expect(new Set(journal.pages.map((p) => p.momentId)).size).toBe(26);
  });

  test("a locked journal takes no new page, and unlocking cuts it", async () => {
    const { t, owner, eventId, moment } = await setup();
    await moment(JUNE_1, "First");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await owner.mutation(api.api.journal.setLock, { eventId, locked: true });
    const second = await moment(JUNE_1 + 86_400_000, "While locked");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const locked = await owner.query(api.api.journal.get, { eventId });
    expect(locked.pages.some((p) => p.momentId === second)).toBe(false);
    const mark = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("journals")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .unique();
      const made = await ctx.db.get("moments", second);
      return { filledAt: row?.filledAt, created: made?._creationTime };
    });
    expect(mark.filledAt).toBeLessThan(mark.created!);

    await owner.mutation(api.api.journal.setLock, { eventId, locked: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const open = await owner.query(api.api.journal.get, { eventId });
    expect(open.pages.some((p) => p.momentId === second)).toBe(true);
    expect(open.pending).toBe(0);
  });

  test("a full book names the moments that never got a page", async () => {
    const { t, owner, eventId, moment } = await setup();
    await moment(JUNE_1, "Already");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      const count = (await ctx.db.query("journalPages").take(500)).length;
      for (let i = count; i < 400; i++) {
        await ctx.db.insert("journalPages", {
          eventId,
          order: 1_000_000 + i,
          paper: "cream",
          elements: [],
        });
      }
    });
    const left = await moment(JUNE_1 + 86_400_000, "Left out");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await owner.query(api.api.journal.unpaged, { eventId })).toEqual({
      full: true,
      momentIds: [left],
    });
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBe(1);
    expect(
      (await owner.query(api.api.journal.get, { eventId })).pages.some((p) => p.momentId === left),
    ).toBe(false);
  });

  test("waiting pages are cut without a new moment, and a page taken out stays out", async () => {
    const { t, owner, eventId, moment } = await setup();
    const first = await moment(JUNE_1, "Pastéis by the river");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const made = (await owner.query(api.api.journal.get, { eventId })).pages.find(
      (p) => p.momentId === first,
    );
    expect(made).toBeDefined();
    await owner.mutation(api.api.journal.removePage, { pageId: made!._id });

    await t.mutation(internal.model.journal.backfillWaiting, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await owner.query(api.api.journal.get, { eventId })).pages.some((p) => p.momentId === first),
    ).toBe(false);

    // Rewind the mark, as if this moment was saved and never paged.
    await t.run(async (ctx) => {
      const journal = await ctx.db
        .query("journals")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .unique();
      if (journal === null) throw new Error("journal missing");
      await ctx.db.patch("journals", journal._id, { filledAt: 0 });
    });
    expect((await owner.query(api.api.journal.get, { eventId })).pending).toBeGreaterThan(0);
    await t.mutation(internal.model.journal.backfillWaiting, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const again = await owner.query(api.api.journal.get, { eventId });
    expect(again.pages.some((p) => p.momentId === first)).toBe(true);
    expect(again.pending).toBe(0);
  });

  test("a page taken out on purpose is not the journal being full", async () => {
    const { t, owner, eventId, moment } = await setup();
    const id = await moment(JUNE_1, "Taken out");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const page = (await owner.query(api.api.journal.get, { eventId })).pages.find(
      (p) => p.momentId === id,
    );
    await owner.mutation(api.api.journal.removePage, { pageId: page!._id });
    expect(await owner.query(api.api.journal.unpaged, { eventId })).toEqual({
      full: false,
      momentIds: [],
    });
    await moment(JUNE_1 + 86_400_000, "Next");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const notes = (await owner.query(api.api.journal.get, { eventId })).pages.map(
      (p) => p.elements.find((e) => e.kind === "note")?.text,
    );
    expect(notes).toEqual([undefined, "Next"]);
  });

  test("a page catches up when its moment changes, and a saved page waits to be asked", async () => {
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    const { owner, viewer, eventId, moment, photo } = await setup();
    const momentId = await moment(JUNE_1, "First words");
    await owner.mutation(api.api.journal.fill, { eventId });
    const before = (await owner.query(api.api.journal.get, { eventId })).pages[1]!;
    expect(before.stale).toBe(false);
    expect(before.edited).toBe(false);
    expect(before.elements.find((e) => e.kind === "note")?.text).toBe("First words");

    vi.setSystemTime(new Date("2026-06-01T12:01:00Z"));
    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "Better words" }],
    });
    expect((await owner.query(api.api.journal.outline, { eventId })).pages[1]!.stale).toBe(true);
    expect(await owner.mutation(api.api.journal.refresh, { eventId })).toBe(1);
    const caught = (await owner.query(api.api.journal.page, { pageId: before._id }))!;
    expect(caught.elements.find((e) => e.kind === "note")?.text).toBe("Better words");
    expect(caught.stale).toBe(false);
    expect(caught.edited).toBe(false);

    const loose = await photo();
    await owner.mutation(api.api.journal.keepSticker, { mediaId: loose });
    await owner.mutation(api.api.journal.savePage, {
      pageId: before._id,
      elements: [
        ...caught.elements.map((e) => ({
          id: e.id,
          kind: e.kind,
          x: e.x,
          y: e.y,
          w: e.w,
          h: e.h,
          rotation: e.rotation,
          z: e.z,
          ...(e.style !== undefined ? { style: e.style } : {}),
          ...(e.text !== undefined ? { text: e.text } : {}),
          ...(e.mediaId !== undefined ? { mediaId: e.mediaId } : {}),
          ...(e.momentId !== undefined ? { momentId: e.momentId } : {}),
        })),
        {
          id: "mine",
          kind: "sticker" as const,
          x: 40,
          y: 900,
          w: 80,
          h: 80,
          rotation: 0,
          z: 40,
          mediaId: loose,
        },
      ],
    });
    vi.setSystemTime(new Date("2026-06-01T12:02:00Z"));
    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "Later words" }],
    });
    expect(await owner.mutation(api.api.journal.refresh, { eventId })).toBe(0);
    const held = (await owner.query(api.api.journal.page, { pageId: before._id }))!;
    expect(held.edited).toBe(true);
    expect(held.elements.find((e) => e.kind === "note")?.text).toBe("Better words");

    expect(await owner.mutation(api.api.journal.refresh, { eventId, pageId: before._id })).toBe(1);
    const updated = (await owner.query(api.api.journal.page, { pageId: before._id }))!;
    expect(updated.elements.find((e) => e.kind === "note")?.text).toBe("Later words");
    expect(updated.elements.some((e) => e.id === "mine" && e.mediaId === loose)).toBe(true);
    expect(updated.edited).toBe(true);

    await owner.mutation(api.api.moments.remove, { momentId });
    const gone = (await owner.query(api.api.journal.page, { pageId: before._id }))!;
    expect(gone.gone).toBe(true);
    expect(gone.elements.find((e) => e.kind === "note")?.text).toBe("Later words");
    expect(await owner.mutation(api.api.journal.refresh, { eventId, pageId: before._id })).toBe(0);
    await expect(viewer.mutation(api.api.journal.refresh, { eventId })).rejects.toThrow();
  });

  test("the cover follows the trip's name and dates until someone retypes it", async () => {
    const { owner, eventId, moment } = await setup();
    await moment(JUNE_1, "First");
    await owner.mutation(api.api.journal.fill, { eventId });
    const cover = async () => (await owner.query(api.api.journal.get, { eventId })).pages[0]!;
    const words = async () =>
      (await cover()).elements.filter((e) => e.kind === "title").map((e) => e.text);
    expect(await words()).toContain("A week in Lisbon");
    expect(await words()).toContain("1 Jun 2026");

    await owner.mutation(api.api.events.update, { eventId, title: "A week in Porto" });
    expect(await words()).toContain("A week in Porto");
    expect(await words()).not.toContain("A week in Lisbon");

    // What a browser at UTC+3 saves for 1 and 7 June: their local midnights.
    await owner.mutation(api.api.events.update, {
      eventId,
      startsAt: Date.UTC(2026, 4, 31, 21),
      endsAt: Date.UTC(2026, 5, 6, 21),
    });
    expect(await words()).toContain("1 Jun – 7 Jun 2026");
    expect(await words()).not.toContain("1 Jun 2026");

    const page = await cover();
    await owner.mutation(api.api.journal.savePage, {
      pageId: page._id,
      elements: page.elements.map((e) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        rotation: e.rotation,
        z: e.z,
        ...(e.style !== undefined ? { style: e.style } : {}),
        ...(e.text !== undefined
          ? { text: e.kind === "title" && e.text === "A week in Porto" ? "Our trip" : e.text }
          : {}),
        ...(e.mediaId !== undefined ? { mediaId: e.mediaId } : {}),
        ...(e.momentId !== undefined ? { momentId: e.momentId } : {}),
      })),
    });
    await owner.mutation(api.api.events.update, { eventId, title: "Something else entirely" });
    const kept = await words();
    expect(kept).toContain("Our trip");
    expect(kept).not.toContain("Something else entirely");
    expect(kept).toContain("1 Jun – 7 Jun 2026");
  });

  test('a title the owner retyped stays through "Update this page"', async () => {
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    const { owner, eventId, moment } = await setup();
    const momentId = await moment(JUNE_1, "First words");
    await owner.mutation(api.api.journal.fill, { eventId });
    const page = (await owner.query(api.api.journal.get, { eventId })).pages[1]!;
    const title = page.elements.find((e) => e.kind === "title")!;
    await owner.mutation(api.api.journal.savePage, {
      pageId: page._id,
      elements: page.elements.map((e) => ({
        ...e,
        text: e.id === title.id ? "Our best day" : e.text,
      })),
    });
    const saved = (await owner.query(api.api.journal.page, { pageId: page._id }))!;
    expect(saved.elements.find((e) => e.id === title.id)?.own).toBe(true);
    // Moving something without changing its words doesn't make it the owner's.
    expect(saved.elements.find((e) => e.kind === "note")?.own).toBeUndefined();

    vi.setSystemTime(new Date("2026-06-01T12:05:00Z"));
    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "Later words" }],
    });
    expect(await owner.mutation(api.api.journal.refresh, { eventId, pageId: page._id })).toBe(1);
    const updated = (await owner.query(api.api.journal.page, { pageId: page._id }))!;
    expect(updated.elements.filter((e) => e.kind === "title").map((e) => e.text)).toEqual([
      "Our best day",
    ]);
    expect(updated.elements.find((e) => e.kind === "note")?.text).toBe("Later words");
  });

  test("a trip with no dates keeps its cover's dates in step with its first and last moment", async () => {
    const { owner, eventId, moment } = await setup();
    await moment(JUNE_1, "First");
    await owner.mutation(api.api.journal.fill, { eventId });
    const dates = async () =>
      (await owner.query(api.api.journal.get, { eventId })).pages[0]!.elements.filter(
        (e) => e.kind === "title",
      ).map((e) => e.text);
    expect(await dates()).toContain("1 Jun 2026");
    const later = await moment(JUNE_1 + 3 * 86_400_000, "Later");
    expect(await dates()).toContain("1 Jun – 4 Jun 2026");
    await owner.mutation(api.api.moments.remove, { momentId: later });
    expect(await dates()).toContain("1 Jun 2026");
    expect(await dates()).not.toContain("1 Jun – 4 Jun 2026");
  });

  test("words are encrypted at rest", async () => {
    const { t, owner, eventId, moment } = await setup();
    await moment(JUNE_1, "secret-note");
    await owner.mutation(api.api.journal.fill, { eventId });
    const rows = await t.run((ctx) => ctx.db.query("journalPages").take(100));
    expect(JSON.stringify(rows)).not.toContain("secret-note");
    expect(JSON.stringify(rows)).not.toContain("A week in Lisbon");
  });
});

describe("editing pages", () => {
  test("the owner saves a page; a viewer reads it and can't change it", async () => {
    const { owner, viewer, eventId } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId, paper: "kraft" });
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      paper: "grid",
      elements: [element()],
    });
    const seen = await viewer.query(api.api.journal.get, { eventId });
    expect(seen.canEdit).toBe(false);
    expect(seen.pending).toBe(0);
    expect(seen.pages[0]).toMatchObject({ paper: "grid", elements: [{ id: "e1", text: "Hello" }] });
    await expect(
      viewer.mutation(api.api.journal.savePage, { pageId, elements: [] }),
    ).rejects.toThrow();
  });

  test("a page holds only what belongs: known styles, this experience's photos", async () => {
    const { owner, other, eventId, photo } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    const save = (e: ReturnType<typeof element>) =>
      owner.mutation(api.api.journal.savePage, { pageId, elements: [e] });
    await expect(save(element({ style: "comic-sans" }))).rejects.toThrow(/style/);
    await expect(save(element({ x: Infinity }))).rejects.toThrow();
    // An unattached upload is not a photo of the experience.
    await expect(
      save(element({ kind: "photo", style: "polaroid", text: undefined, mediaId: await photo() })),
    ).rejects.toThrow(/isn't in this experience/);
    const theirs = await other.mutation(api.api.events.createDraft, {});
    await expect(
      save(
        element({
          kind: "photo",
          style: "polaroid",
          text: undefined,
          mediaId: await photo(other, theirs),
        }),
      ),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.api.journal.savePage, { pageId, elements: [element(), element()] }),
    ).rejects.toThrow(/own id/);
  });

  test("a locked page, or a locked journal, can't change until it is unlocked", async () => {
    const { owner, eventId } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    await owner.mutation(api.api.journal.setLock, { eventId, pageId, locked: true });
    await expect(
      owner.mutation(api.api.journal.savePage, { pageId, elements: [element()] }),
    ).rejects.toThrow(/locked/);
    await expect(owner.mutation(api.api.journal.removePage, { pageId })).rejects.toThrow(/locked/);
    await expect(
      owner.mutation(api.api.journal.movePage, { pageId, before: null }),
    ).rejects.toThrow(/locked/);
    await owner.mutation(api.api.journal.setLock, { eventId, pageId, locked: false });
    await owner.mutation(api.api.journal.movePage, { pageId, before: null });
    await owner.mutation(api.api.journal.savePage, { pageId, elements: [element()] });

    await owner.mutation(api.api.journal.setLock, { eventId, locked: true });
    expect((await owner.query(api.api.journal.get, { eventId })).locked).toBe(true);
    await expect(owner.mutation(api.api.journal.addPage, { eventId })).rejects.toThrow(/locked/);
    await expect(
      owner.mutation(api.api.journal.savePage, { pageId, elements: [] }),
    ).rejects.toThrow(/locked/);
  });

  test("pages move before another, or to the end", async () => {
    const { owner, eventId } = await setup();
    const a = await owner.mutation(api.api.journal.addPage, { eventId, paper: "cream" });
    const b = await owner.mutation(api.api.journal.addPage, { eventId, paper: "kraft" });
    const c = await owner.mutation(api.api.journal.addPage, { eventId, paper: "grid" });
    const order = async () =>
      (await owner.query(api.api.journal.get, { eventId })).pages.map((p) => p._id);
    expect(await order()).toEqual([a, b, c]);
    await owner.mutation(api.api.journal.movePage, { pageId: c, before: a });
    expect(await order()).toEqual([c, a, b]);
    await owner.mutation(api.api.journal.movePage, { pageId: c, before: null });
    expect(await order()).toEqual([a, b, c]);
    const d = await owner.mutation(api.api.journal.addPage, { eventId, after: a });
    expect(await order()).toEqual([a, d, b, c]);
  });

  test("an imported journal comes in at the end, without what doesn't belong", async () => {
    const { owner, other, eventId, photo } = await setup();
    const theirs = await other.mutation(api.api.events.createDraft, {});
    const foreign = await photo(other, theirs);
    const added = await owner.mutation(api.api.journal.importPages, {
      eventId,
      pages: [
        {
          paper: "no-such-paper",
          elements: [
            element(),
            element({
              id: "e2",
              kind: "photo",
              style: "polaroid",
              text: undefined,
              mediaId: foreign,
            }),
          ],
        },
      ],
    });
    expect(added).toBe(1);
    const [page] = (await owner.query(api.api.journal.get, { eventId })).pages;
    expect(page).toMatchObject({ paper: "cream", elements: [{ id: "e1" }] });
  });
});

describe("drawings, links and new pages", () => {
  test("a drawing needs strokes, a link a web address, and colours are colours", async () => {
    const { owner, eventId } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    const save = (e: ElementArg) =>
      owner.mutation(api.api.journal.savePage, { pageId, elements: [e] });
    await save(
      element({
        kind: "drawing",
        style: "marker",
        text: "0 0 100 100\nmarker #c4552f M0 0L10 10",
        color: "#c4552f",
      }),
    );
    await expect(save(element({ kind: "drawing", style: "pen", text: " " }))).rejects.toThrow(
      /strokes/,
    );
    await expect(
      save(element({ kind: "drawing", style: "pen", text: "0 0 1 1", color: "red" })),
    ).rejects.toThrow(/colour/);
    await save(
      element({
        kind: "link",
        style: "card",
        text: JSON.stringify({ url: "https://example.com/a", title: "A" }),
      }),
    );
    await expect(
      save(
        element({
          kind: "link",
          style: "card",
          text: JSON.stringify({ url: "javascript:alert(1)" }),
        }),
      ),
    ).rejects.toThrow(/web address/);
    await expect(save(element({ kind: "link", style: "card", text: "not json" }))).rejects.toThrow(
      /web address/,
    );
  });

  test("a link card keeps only https pictures and names its site", () => {
    expect(
      readLink(
        JSON.stringify({ url: "https://www.example.com/x", image: "http://evil.test/p.png" }),
      ),
    ).toEqual({
      url: "https://www.example.com/x",
      title: undefined,
      description: undefined,
      image: undefined,
      site: "example.com",
    });
  });

  test("a locked thing cannot be moved or removed until it is unlocked", async () => {
    const { owner, eventId } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    const locked = element({ locked: true });
    const beside = element({ id: "e2", x: 400, text: "Beside" });
    await owner.mutation(api.api.journal.savePage, { pageId, elements: [locked] });
    await expect(
      owner.mutation(api.api.journal.savePage, { pageId, elements: [{ ...locked, x: 80 }] }),
    ).rejects.toThrow(/locked in place/);
    await expect(
      owner.mutation(api.api.journal.savePage, { pageId, elements: [] }),
    ).rejects.toThrow(/locked in place/);
    await expect(
      owner.mutation(api.api.journal.savePage, {
        pageId,
        elements: [{ ...locked, locked: undefined, x: 80 }],
      }),
    ).rejects.toThrow(/locked in place/);
    await owner.mutation(api.api.journal.savePage, { pageId, elements: [locked, beside] });
    const saved = (await owner.query(api.api.journal.get, { eventId })).pages.find(
      (p) => p._id === pageId,
    );
    expect(saved?.elements.find((e) => e.id === "e1")).toMatchObject({
      x: 10,
      locked: true,
      text: "Hello",
    });
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      elements: [{ ...locked, locked: undefined }, beside],
    });
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      elements: [{ ...locked, locked: undefined, x: 80 }, beside],
    });
    const moved = (await owner.query(api.api.journal.get, { eventId })).pages.find(
      (p) => p._id === pageId,
    );
    expect(moved?.elements.find((e) => e.id === "e1")).toMatchObject({ x: 80 });
    expect(moved?.elements.find((e) => e.id === "e1")?.locked).toBeUndefined();
  });

  test("a page can start with things on it", async () => {
    const { owner, eventId } = await setup();
    const pageId = await owner.mutation(api.api.journal.addPage, {
      eventId,
      paper: "blush",
      elements: [element({ text: "Greetings" })],
    });
    const page = (await owner.query(api.api.journal.get, { eventId })).pages.find(
      (p) => p._id === pageId,
    );
    expect(page).toMatchObject({ paper: "blush", elements: [{ text: "Greetings" }] });
  });

  test("a link's preview comes from its page's tags", () => {
    const html = `<head><title>Fallback</title><meta property="og:title" content="Tiles &amp; trams"><meta name="description" content="A  day   out"><meta property="og:image" content="/pic.jpg"></head>`;
    expect(previewFromHtml(html, "https://www.lisbon.test/day")).toEqual({
      url: "https://www.lisbon.test/day",
      title: "Tiles & trams",
      description: "A day out",
      image: "https://www.lisbon.test/pic.jpg",
      site: "lisbon.test",
    });
    // Pictures only over https, and never from a private address.
    expect(
      previewFromHtml(`<meta property="og:image" content="http://x.test/a.png">`, "https://x.test")
        .image,
    ).toBeUndefined();
    expect(
      previewFromHtml(
        `<meta property="og:image" content="https://127.0.0.1/a.png">`,
        "https://x.test",
      ).image,
    ).toBeUndefined();
    expect(previewFromHtml(`<title>Only a title</title>`, "https://x.test").title).toBe(
      "Only a title",
    );
  });

  test("a preview will not follow a link to a private or local address", () => {
    const allowed = (raw: string) => isPublicWebUrl(new URL(raw));
    expect(allowed("https://example.com/day")).toBe(true);
    expect(allowed("http://127.0.0.1/")).toBe(false);
    expect(allowed("http://169.254.169.254/latest")).toBe(false);
    expect(allowed("http://10.0.0.8/")).toBe(false);
    expect(allowed("http://192.168.0.1/")).toBe(false);
    expect(allowed("http://localhost/")).toBe(false);
    expect(allowed("http://localhost./")).toBe(false);
    expect(allowed("http://127.1/")).toBe(false);
    expect(allowed("http://0177.0.0.1/")).toBe(false);
    expect(allowed("http://0x7f.0.0.1/")).toBe(false);
    expect(allowed("http://printer.local/")).toBe(false);
    expect(allowed("http://nas.home.arpa/")).toBe(false);
    expect(allowed("http://metadata.google.internal/")).toBe(false);
    expect(allowed("https://user:pass@example.com/")).toBe(false);
    expect(publicRedirect("https://example.com/a", "/b")).toBe("https://example.com/b");
    expect(publicRedirect("https://example.com/a", "http://169.254.169.254/")).toBeUndefined();
    expect(publicRedirect("https://example.com/a", "http://127.0.0.1/secret")).toBeUndefined();
  });
});

describe("stickers", () => {
  test("a cut-out kept as a sticker is on the shelf and on pages, and everyone with access sees it", async () => {
    const { t, owner, viewer, eventId, photo } = await setup();
    const mediaId = await photo();
    await owner.mutation(api.api.journal.keepSticker, { mediaId });
    expect(await viewer.query(api.api.journal.stickers, { eventId })).toEqual([mediaId]);
    // Seen by a viewer, though it is on no moment.
    expect(await viewer.query(api.api.media.getForDownload, { mediaId })).not.toBeNull();
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      elements: [element({ kind: "sticker", style: undefined, text: undefined, mediaId })],
    });
    const row = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(row?.purpose).toBe("sticker");
  });

  test("only a fresh cut-out of your own becomes one", async () => {
    const { owner, viewer, photo, moment } = await setup();
    const used = await photo();
    await moment(JUNE_1, "on a moment", used);
    await expect(owner.mutation(api.api.journal.keepSticker, { mediaId: used })).rejects.toThrow();
    await expect(
      viewer.mutation(api.api.journal.keepSticker, { mediaId: await photo() }),
    ).rejects.toThrow();
  });

  test("any picture of your own can be kept, a JPEG too", async () => {
    const { owner, eventId } = await setup();
    const { mediaId } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/jpeg",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId });
    await owner.mutation(api.api.journal.keepSticker, { mediaId });
    expect(await owner.query(api.api.journal.stickers, { eventId })).toEqual([mediaId]);
  });

  test("a sticker leaves the shelf only when no page still shows it", async () => {
    const { owner, eventId, photo } = await setup();
    const mediaId = await photo();
    await owner.mutation(api.api.journal.keepSticker, { mediaId });
    const sticker = element({
      id: "s1",
      kind: "sticker",
      style: undefined,
      text: undefined,
      mediaId,
    });
    const first = await owner.mutation(api.api.journal.addPage, { eventId, elements: [sticker] });
    const second = await owner.mutation(api.api.journal.addPage, {
      eventId,
      elements: [{ ...sticker, id: "s2" }],
    });
    await expect(owner.mutation(api.api.journal.dropSticker, { mediaId })).rejects.toThrow(
      /still on a page/,
    );
    await expect(owner.mutation(api.api.media.markDeleted, { mediaId })).rejects.toThrow();
    await owner.mutation(api.api.journal.savePage, { pageId: first, elements: [] });
    await expect(owner.mutation(api.api.journal.dropSticker, { mediaId })).rejects.toThrow(
      /still on a page/,
    );
    await owner.mutation(api.api.journal.savePage, { pageId: second, elements: [] });
    await owner.mutation(api.api.journal.dropSticker, { mediaId });
    await owner.mutation(api.api.media.markDeleted, { mediaId });
    expect(await owner.query(api.api.journal.stickers, { eventId })).toEqual([]);
  });
});

test("deleting the experience takes its journal with it", async () => {
  const { t, owner, eventId, moment } = await setup();
  await moment(JUNE_1, "x");
  await owner.mutation(api.api.journal.fill, { eventId });
  await t.mutation(internal.model.events.purgeEventData, { eventId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const left = await t.run(async (ctx) => [
    (await ctx.db.query("journals").take(100)).length,
    (await ctx.db.query("journalPages").take(100)).length,
  ]);
  expect(left).toEqual([0, 0]);
});
