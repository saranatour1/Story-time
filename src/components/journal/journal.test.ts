import { describe, expect, test } from "vitest";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MomentView } from "@/components/event/types";
import { formatDay } from "@/lib/local-time";
import { dayKey } from "@/lib/photo-groups";
import { groupByDay } from "@/lib/timeline";
import { contentsByDay } from "./contents";
import { noteWasCut, pageForPlay, playSurface } from "./play";
import { behind, placed, sizeOf, tapedTo } from "./add";
import { journalFile, readJournalFile, wholeJournalPdfLabel } from "./export";
import { dayIdea, IDEAS, tierIdea } from "./ideas";

const el = (over: Partial<JournalElement>): JournalElement => ({
  id: "x",
  kind: "photo",
  x: 100,
  y: 100,
  w: 300,
  h: 300,
  rotation: 0,
  z: 5,
  mediaId: "m",
  ...over,
});

describe("adding to a page", () => {
  test("a new thing gets its kind's size and goes on top; a shape goes behind", () => {
    const page = [el({ id: "a", z: 4 }), el({ id: "b", z: 9 })];
    const title = placed({ kind: "title", style: "dada", text: "Hi", w: 0, h: 0 }, page, "t");
    expect(title).toMatchObject({ id: "t", ...sizeOf("title"), z: 10, rotation: 0 });
    const circle = placed({ kind: "deco", style: "circle-teal", w: 0, h: 0 }, page, "c");
    expect(circle.z).toBe(-1);
    expect(behind(circle)).toBe(true);
    expect(sizeOf("deco", "tape-rose")).toEqual(sizeOf("deco", "tape"));
  });

  test("things added one after another fan out instead of piling up", () => {
    const spots = new Set(
      Array.from({ length: 5 }, (_, i) => {
        const p = placed({ kind: "note", text: "", w: 0, h: 0 }, [], `n${i}`);
        return `${p.x},${p.y}`;
      }),
    );
    expect(spots.size).toBe(5);
  });
});

describe("tape", () => {
  test("a strip across a photo's top moves with it; one elsewhere, under it, or locked stays", () => {
    const photo = el({ id: "p", x: 100, y: 100, w: 300, h: 300, z: 5 });
    const across = el({
      id: "t1",
      kind: "deco",
      style: "tape",
      mediaId: undefined,
      x: 180,
      y: 84,
      w: 140,
      h: 36,
      z: 6,
    });
    const away = el({
      id: "t2",
      kind: "deco",
      style: "tape",
      mediaId: undefined,
      x: 600,
      y: 600,
      w: 140,
      h: 36,
      z: 6,
    });
    const under = el({
      id: "t3",
      kind: "deco",
      style: "tape-rose",
      mediaId: undefined,
      x: 180,
      y: 84,
      w: 140,
      h: 36,
      z: 1,
    });
    const stuck = el({
      id: "t4",
      kind: "deco",
      style: "tape",
      mediaId: undefined,
      x: 180,
      y: 84,
      w: 140,
      h: 36,
      z: 7,
      locked: true,
    });
    expect(tapedTo(photo, [photo, across, away, under, stuck]).map((t) => t.id)).toEqual(["t1"]);
  });

  test("a title carries nothing", () => {
    const title = el({ id: "title", kind: "title", mediaId: undefined });
    expect(tapedTo(title, [el({ id: "t", kind: "deco", style: "tape", z: 9 })])).toEqual([]);
  });
});

describe("journal files", () => {
  test("a saved journal reads back page for page", async () => {
    const pages = [
      {
        paper: "kraft",
        elements: [
          el({ id: "a" }),
          el({ id: "b", kind: "title", text: "Hello", mediaId: undefined }),
        ],
      },
    ];
    const blob = journalFile("Lisbon", pages);
    const back = await readJournalFile(new File([await blob.text()], "lisbon.journal.json"));
    expect(back).toEqual(pages);
  });

  test("something that isn't a journal file is refused; broken things inside are dropped", async () => {
    await expect(readJournalFile(new File(["not json"], "x.json"))).rejects.toThrow(/journal file/);
    await expect(
      readJournalFile(new File([JSON.stringify({ kind: "other" })], "x.json")),
    ).rejects.toThrow(/journal file/);
    const file = new File(
      [
        JSON.stringify({
          kind: "story-time-journal",
          version: 1,
          pages: [
            {
              paper: "cream",
              elements: [
                { id: "ok", kind: "note", x: 1, y: 1, w: 9, h: 9, rotation: 0, z: 1 },
                { id: "bad" },
              ],
            },
            { nope: true },
          ],
        }),
      ],
      "x.json",
    );
    const back = await readJournalFile(file);
    expect(back).toHaveLength(1);
    expect(back[0]!.elements.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("play", () => {
  test("opens the book on that moment's page, and the story when there is no page", () => {
    const pages = [{ momentId: undefined }, { momentId: "m1" }, { momentId: "m2" }];
    expect(playSurface(pages, "m2")).toBe("book");
    expect(pageForPlay(pages, "m2")).toBe(2);
    expect(playSurface(pages, "gone")).toBe("story");
    expect(playSurface([], undefined)).toBe("story");
    expect(pageForPlay(pages, undefined)).toBe(0);
  });

  test("a clipped note still has the whole moment to read", () => {
    const printed = `${"a".repeat(397)}…`;
    expect(noteWasCut(printed, "a".repeat(500))).toBe(true);
    expect(noteWasCut("A short note", "A short note")).toBe(false);
    expect(noteWasCut(undefined, "A short note")).toBe(false);
  });
});

describe("printing", () => {
  test("the whole journal is the long choice past a few dozen pages", () => {
    expect(wholeJournalPdfLabel(1)).toBe("The whole journal as a PDF (1 page)");
    expect(wholeJournalPdfLabel(12)).toBe("The whole journal as a PDF (12 pages)");
    expect(wholeJournalPdfLabel(37)).toBe("The whole journal as a PDF (37 pages, a long one)");
  });
});

describe("the contents strip", () => {
  const day = { weekday: "short", month: "short", day: "numeric" } as const;
  const moment = (startsAt: number) => ({ startsAt, tzOffsetMinutes: 0 });
  test("pages gather under the cover and then each day, in book order", () => {
    const june3 = Date.UTC(2026, 5, 3, 9);
    const june4 = Date.UTC(2026, 5, 4, 9);
    const moments = new Map([
      ["m1", moment(june3)],
      ["m2", moment(june3 + 3_600_000)],
      ["m3", moment(june4)],
    ]);
    const groups = contentsByDay(
      [
        { _id: "cover" },
        { _id: "p1", momentId: "m1" },
        { _id: "blank" },
        { _id: "p2", momentId: "m2" },
        { _id: "p3", momentId: "m3" },
      ],
      moments,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Cover",
      formatDay(june3, 0, day),
      formatDay(june4, 0, day),
    ]);
    expect(groups[0]!.pages.map((p) => p.index)).toEqual([0]);
    // A page with no moment stays with the day before it.
    expect(groups[1]!.pages.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(groups[2]!.pages.map((p) => p.index)).toEqual([4]);
    expect(groups.every((g) => g.today === false)).toBe(true);
  });

  test("the viewer's day is marked, and the cover never is", () => {
    const june3 = Date.UTC(2026, 5, 3, 9);
    const moments = new Map([["m1", moment(june3)]]);
    const groups = contentsByDay(
      [{ _id: "cover" }, { _id: "p1", momentId: "m1" }],
      moments,
      dayKey(june3, 0),
    );
    expect(groups.map((g) => g.today)).toEqual([false, true]);
  });
});

describe("page ideas", () => {
  const trip = { title: "Lisbon", photos: ["p1", "p2"], dates: "June 2026" };
  const onThePage = (els: JournalElement[]) =>
    els
      .filter((e) => e.kind !== "deco")
      .every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= PAGE.w && e.y + e.h <= PAGE.h);

  test("every idea makes a page of its own ids, inside the page", () => {
    for (const idea of IDEAS) {
      const els = idea.make(trip);
      expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
      expect(onThePage(els)).toBe(true);
    }
  });

  test("what we did that day lists the day's moments in order, with its photos", () => {
    const m = (id: string, hour: number, text: string, photo?: string): MomentView => ({
      _id: id as MomentView["_id"],
      authorId: "u1" as MomentView["authorId"],
      startsAt: Date.UTC(2026, 5, 3, hour),
      tzOffsetMinutes: 0,
      blocks: [
        ...(photo ? [{ type: "photo" as const, mediaId: photo as Id<"media"> }] : []),
        { type: "note" as const, text },
      ],
      stops: [],
      labels: [],
      people: [],
    });
    const [day] = groupByDay([m("b", 15, "Tram 28", "p2"), m("a", 9, "Coffee", "p1")]);
    const els = dayIdea(day!).make(trip);
    const list = els.find((e) => e.kind === "note")!.text!;
    expect(list.indexOf("Coffee")).toBeLessThan(list.indexOf("Tram 28"));
    expect(els.filter((e) => e.kind === "photo").map((e) => e.mediaId)).toEqual(["p1", "p2"]);
    expect(onThePage(els)).toBe(true);
  });

  test("a tier list has rows S to F and continues what doesn't fit on the next page", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      text: `Place ${i}`,
      mediaId: i % 3 === 0 ? `p${i}` : undefined,
    }));
    const idea = tierIdea("places", "every place", items);
    const first = idea.make(trip);
    const rest = idea.more?.(trip) ?? [];
    expect(first.filter((e) => e.style === "tier").map((e) => e.text)).toEqual([
      "S",
      "A",
      "B",
      "C",
      "D",
      "F",
    ]);
    const ranked = [...first, ...rest.flat()].filter(
      (e) => e.kind === "photo" || e.style === "label",
    );
    expect(ranked).toHaveLength(items.length);
    expect(rest.length).toBeGreaterThan(0);
    expect(onThePage(first)).toBe(true);
    for (const els of rest) expect(onThePage(els)).toBe(true);
  });
});
