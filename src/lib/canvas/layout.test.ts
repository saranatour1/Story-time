import { describe, expect, test } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { fillSpecs, frameSpot, starterSpecs, STARTERS } from "./fill";
import { arrange, type Box, cellOf, clearOf, freeSpot, GAP, packFrames, pageFor, pagesOf, snap, topMargin } from "./layout";

const at = (day: number, hour = 12) => Date.UTC(2026, 4, 1 + day, hour);
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("pages", () => {
  test("moments group by the day in their own zone, in order", () => {
    const pages = pagesOf(
      [
        { _id: "c", startsAt: at(1, 9), place: "Sintra, Portugal" },
        { _id: "a", startsAt: at(0, 10), tzOffsetMinutes: 60, place: "Lisbon, Portugal" },
        { _id: "b", startsAt: at(0, 23), tzOffsetMinutes: 60, place: "Lisbon, Portugal" },
      ],
      0,
    );
    // 23:00 UTC at +01:00 is already the next day there.
    expect(pages.map((p) => p.ids)).toEqual([["a"], ["b", "c"]]);
    expect(pages[0]!.note).toBe("Lisbon");
    expect(pages[1]!.note).toBe("Lisbon · Sintra");
  });

  test("a page grows with its moments and its cells never overlap", () => {
    for (const n of [1, 2, 4, 5, 9, 12]) {
      const { cols, w, h } = pageFor(n);
      const cells = Array.from({ length: n }, (_, i) => cellOf(i, cols));
      for (const c of cells) expect(c.x + c.w <= w && c.y + c.h <= h).toBe(true);
      for (const [i, a] of cells.entries()) for (const b of cells.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
  });
});

describe("frames", () => {
  test("pack into rows with a gap and no overlap", () => {
    const sizes = Array.from({ length: 7 }, (_, i) => ({ w: 600 + i * 50, h: 500 + (i % 3) * 100 }));
    const spots = packFrames(sizes, { x: 0, y: 0 });
    const boxes = spots.map((s, i) => ({ ...s, ...sizes[i]! }));
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(overlap({ ...a, x: a.x - GAP / 2, y: a.y - GAP / 2, w: a.w + GAP, h: a.h + GAP }, b)).toBe(false);
    }
    expect(spots[3]!.x).toBe(0);
    expect(spots[3]!.y).toBeGreaterThan(0);
  });

  test("a frame dropped on another is moved off it, a gap away", () => {
    const other: Box = { x: 0, y: 0, w: 1000, h: 600 };
    const moved = clearOf({ x: 200, y: 100, w: 800, h: 500 }, [other]);
    const box = { ...moved, w: 800, h: 500 };
    expect(overlap(box, other)).toBe(false);
    expect(box.x >= other.x + other.w + GAP || box.y >= other.y + other.h + GAP || box.x + box.w <= other.x - GAP || box.y + box.h <= other.y - GAP).toBe(true);
  });

  test("one already clear stays where it is", () => {
    expect(clearOf({ x: 5000, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 100 }])).toEqual({ x: 5000, y: 0 });
  });

  test("a new frame goes beside the last, or at the centre of an empty canvas", () => {
    expect(frameSpot([], { w: 400, h: 200 }, { x: 1000, y: 500 })).toEqual({ x: 800, y: 400 });
    const last: Box = { x: 0, y: 0, w: 1200, h: 800 };
    const spot = frameSpot([last], { w: 900, h: 900 }, { x: 0, y: 0 });
    expect(spot.x).toBe(1200 + GAP);
    expect(overlap({ ...spot, w: 900, h: 900 }, last)).toBe(false);
  });
});

describe("filling a canvas", () => {
  const pages = pagesOf([{ _id: "m1", startsAt: at(0) }, { _id: "m2", startsAt: at(0, 15) }, { _id: "m3", startsAt: at(2) }], 0);

  test("makes a frame for each day with a heading and its moments, in the flow in order", () => {
    const specs = fillSpecs(pages, undefined, 3);
    const frames = specs.flatMap((s, i) => (s.kind === "frame" ? [i] : []));
    expect(frames.map((i) => specs[i]!.order)).toEqual([3, 4]);
    expect(specs.filter((s) => s.kind === "moment").map((s) => s.momentId)).toEqual(["m1", "m2", "m3"]);
    for (const [i, s] of specs.entries()) {
      if (s.parent !== undefined) expect(typeof s.parent === "object" && s.parent.ref < i).toBe(true);
    }
  });

  test("lands below what is already there, a gap away", () => {
    const below = fillSpecs(pages, { x: 100, y: 50, w: 1000, h: 700 }, 1);
    expect(below[0]!.x).toBe(100);
    expect(below[0]!.y).toBe(50 + 700 + GAP);
  });

  test("moments on a frame stay inside it", () => {
    const specs = fillSpecs(pages, undefined, 1);
    const frame = specs[0]!;
    for (const s of specs.slice(1).filter((s) => s.kind === "moment" && typeof s.parent === "object" && s.parent.ref === 0)) {
      expect(s.x + s.w <= frame.w && s.y + s.h <= frame.h).toBe(true);
    }
  });
});

describe("ready-made pages", () => {
  test.each(STARTERS.map((s) => s.id))("%s builds a frame whose parts all point back to something earlier", (id) => {
    const specs = starterSpecs(id, { title: "A week in Portugal", dates: "May 1 to 8" }, { x: 600, y: 400 }, 2);
    expect(specs[0]!.kind).toBe("frame");
    expect(specs[0]!.order).toBe(2);
    expect(specs.length).toBeGreaterThan(2);
    for (const [i, s] of [...specs.entries()].slice(1)) {
      expect(s.parent === undefined).toBe(false);
      if (typeof s.parent === "object") expect(s.parent.ref).toBeLessThan(i);
    }
  });

  test("the cover's letters belong to its title", () => {
    const specs = starterSpecs("cover", { title: "Hi", dates: undefined }, { x: 0, y: 0 }, 1);
    const title = specs.findIndex((s) => s.kind === "ransom");
    const letters = specs.flatMap((s, i) => (s.kind === "letter" ? [i] : []));
    expect(letters).toHaveLength(2);
    for (const i of letters) expect(specs[i]!.parent).toEqual({ ref: title });
  });
});

describe("pieces on a page", () => {
  const frame = { w: 1200, h: 800 };

  test("a free spot never touches what is taken, and is none when the page is full", () => {
    const taken: Box[] = [{ x: 24, y: 24, w: 400, h: 300 }];
    const spot = freeSpot(frame, taken, { w: 300, h: 200 })!;
    expect(overlap({ ...spot, w: 300, h: 200 }, taken[0]!)).toBe(false);
    expect(freeSpot(frame, [{ x: 0, y: 0, w: 1200, h: 800 }], { w: 300, h: 200 })).toBeUndefined();
  });

  test("the top margin clears a heading", () => {
    expect(topMargin([], 800)).toBe(60);
    expect(topMargin([{ x: 60, y: 40, w: 500, h: 110 }], 800)).toBe(190);
  });

  test.each(["grid", "scrapbook", "strip"] as const)("%s keeps every piece on the page and apart", (mode) => {
    const pieces = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, w: 420, h: i % 2 === 0 ? 360 : 300 }));
    const placed = arrange(pieces, frame, 190, mode, "x");
    expect(placed).toHaveLength(5);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(190 - 12);
      expect(p.x + p.w).toBeLessThanOrEqual(frame.w);
      expect(p.y + p.h).toBeLessThanOrEqual(frame.h);
    }
    for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) expect(overlap(a, b)).toBe(false);
  });

  test("a grid keeps each piece's shape and square", () => {
    const [p] = arrange([{ id: "a", w: 400, h: 200 }], frame, 60, "grid");
    expect(p!.w / p!.h).toBeCloseTo(2, 1);
    expect(p!.rotation).toBe(0);
  });

  test("arranging the same pieces twice gives the same page", () => {
    const pieces = [{ id: "a", w: 300, h: 200 }, { id: "b", w: 300, h: 200 }];
    expect(arrange(pieces, frame, 60, "scrapbook", "s")).toEqual(arrange(pieces, frame, 60, "scrapbook", "s"));
  });
});

describe("snapping", () => {
  const targets: Box[] = [{ x: 0, y: 0, w: 1000, h: 600 }];

  test("pulls an edge or the middle onto a line that is near", () => {
    const s = snap({ x: 6, y: 295, w: 100, h: 100 }, targets, 10);
    expect(s.dx).toBe(-6);
    expect(s.x).toBe(0);
    // Its middle (345) is not near 300, but its top (295) is, to the frame's middle.
    expect(s.dy).toBe(5);
    expect(s.y).toBe(300);
  });

  test("leaves a piece alone when nothing is near", () => {
    expect(snap({ x: 130, y: 130, w: 100, h: 100 }, targets, 10)).toEqual({ dx: 0, dy: 0, x: undefined, y: undefined });
  });

  test("takes the nearest line", () => {
    const s = snap({ x: 4, y: 0, w: 1000, h: 10 }, [{ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 0, w: 2, h: 2 }], 10);
    expect(s.dx).toBe(1);
  });
});

describe("a day that already has a frame", () => {
  const page = { name: "Mon, Oct 12", note: undefined, ids: ["x"] };
  const home = { id: "f1" as Id<"canvasNodes">, name: "Mon, Oct 12", heads: [] as string[], w: 1000, h: 570, kids: [] as Box[] };

  test("its new moment goes on that frame, in the room it has", () => {
    const specs = fillSpecs([page], undefined, 5, 0, [home]);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ kind: "moment", parent: "f1", momentId: "x" });
  });

  test("a frame that is full gets a new frame beside it instead", () => {
    const full = { ...home, kids: [{ x: 0, y: 0, w: 1000, h: 570 }] };
    const specs = fillSpecs([page], { x: 0, y: 0, w: 1000, h: 570 }, 5, 0, [full]);
    expect(specs[0]!.kind).toBe("frame");
    expect(specs.filter((s) => s.kind === "moment")).toHaveLength(1);
  });

  test("a frame renamed since is still the day's, by the date in its heading", () => {
    const renamed = { ...home, name: "Pastries by the river", heads: ["Mon, Oct 12"] };
    const specs = fillSpecs([page], undefined, 5, 0, [renamed]);
    expect(specs[0]).toMatchObject({ kind: "moment", parent: "f1" });
  });

  test("a new frame is named for its day and where", () => {
    const specs = fillSpecs([{ ...page, note: "Lisbon · Sintra" }], undefined, 1);
    expect(specs[0]!.text).toBe("Mon, Oct 12 · Lisbon · Sintra");
  });

  test("a day with no frame still gets one", () => {
    expect(fillSpecs([{ ...page, name: "Tue, Oct 13" }], undefined, 1, 0, [home])[0]!.kind).toBe("frame");
  });
});
