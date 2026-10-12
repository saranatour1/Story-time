import type { Id } from "../../../convex/_generated/dataModel";
import { type Box, CELL, cellOf, clearOf, freeSpot, GAP, HEADING, pageFor, type Page, packFrames } from "./layout";
import { FRAME_LOOKS } from "./look";
import { newFrame, type NewNode, newTape, newTitle } from "./make";

// Pages made for you: a frame for each day with its moments laid out on it, and
// ready-made starting pages. They come out as the specs `canvas.add` takes.

// Where a new frame of `size` goes: to the right of the others with a gap,
// level with the last, and clear of everything. On an empty canvas, at `centre`.
export function frameSpot(frames: Box[], size: Pick<Box, "w" | "h">, centre: { x: number; y: number }): { x: number; y: number } {
  const last = frames.reduce<Box | undefined>((far, f) => (far === undefined || f.x + f.w > far.x + far.w ? f : far), undefined);
  const at =
    last === undefined
      ? { x: Math.round(centre.x - size.w / 2), y: Math.round(centre.y - size.h / 2) }
      : { x: last.x + last.w + GAP, y: Math.round(last.y + last.h / 2 - size.h / 2) };
  return clearOf({ ...at, ...size }, frames);
}

// A frame already on the canvas that a day's moments may join: what it is
// called, the first lines of the notes on it (a day's heading is its date, which
// stays when the frame is renamed), how big it is, and what is on it.
export type Home = { id: Id<"canvasNodes">; name: string | undefined; heads: string[]; w: number; h: number; kids: Box[] };

// A frame for each page, in rows below what is already on the canvas (`taken`),
// each in the flow in order from `order`. Its heading and its moments are in it.
// A day that already has a frame in `homes` (named for it) gets its moments
// put on that one, in the room it has, instead of a second frame.
export function fillSpecs(pages: Page[], taken: Box | undefined, order: number, looks = 0, homes: Home[] = []): NewNode[] {
  const joined: NewNode[] = [];
  const fresh: Page[] = [];
  for (const page of pages) {
    const home = homes.find((h) => h.name === page.name || h.heads.includes(page.name));
    const room = home === undefined ? undefined : [...home.kids];
    const spots = home === undefined || room === undefined ? [] : page.ids.map(() => {
      const spot = freeSpot(home, room, CELL);
      if (spot !== undefined) room.push({ ...spot, ...CELL });
      return spot;
    });
    if (home === undefined || spots.length === 0 || spots.some((s) => s === undefined)) {
      fresh.push(page);
      continue;
    }
    for (const [i, id] of page.ids.entries()) {
      joined.push({ kind: "moment", parent: home.id, ...spots[i]!, ...CELL, rotation: 0, momentId: id as NewNode["momentId"] });
    }
  }

  const sizes = fresh.map((p) => pageFor(p.ids.length));
  const spots = packFrames(sizes, taken === undefined ? { x: 0, y: 0 } : { x: taken.x, y: taken.y + taken.h + GAP });
  const out: NewNode[] = [];
  for (const [i, page] of fresh.entries()) {
    const at = out.length;
    const size = sizes[i]!;
    const spot = spots[i]!;
    out.push({
      kind: "frame",
      x: spot.x,
      y: spot.y,
      w: size.w,
      h: size.h,
      look: FRAME_LOOKS[(looks + i) % FRAME_LOOKS.length]!.id,
      order: order + i,
      // The date and where, until it is given a better name.
      text: page.note === undefined ? page.name : `${page.name} · ${page.note}`,
    });
    out.push({
      kind: "scrap",
      parent: { ref: at },
      ...HEADING,
      rotation: -2,
      look: "paper",
      text: page.note === undefined ? page.name : `${page.name}\n${page.note}`,
    });
    for (const [j, id] of page.ids.entries()) {
      out.push({ kind: "moment", parent: { ref: at }, ...cellOf(j, size.cols), rotation: 0, momentId: id as NewNode["momentId"] });
    }
  }
  // The references above count from the start of `out`, so what joins an
  // existing frame (which has none) goes after.
  return [...out, ...joined];
}

// ---- Ready-made pages ----------------------------------------------------------------

export const STARTERS = [
  { id: "cover", name: "Cover page", hint: "Your title cut from letters" },
  { id: "postcard", name: "Postcard", hint: "A note and a stamp" },
  { id: "notes", name: "Memory notes", hint: "Three things to remember" },
] as const;
export type StarterId = (typeof STARTERS)[number]["id"];

type Words = { title: string; dates: string | undefined };

const scrap = (parent: number, text: string, paper: string, x: number, y: number, w: number, h: number, rotation: number): NewNode => ({
  kind: "scrap",
  parent: { ref: parent },
  x,
  y,
  w,
  h,
  rotation,
  look: paper,
  text,
});

// Pieces that sit inside the frame at index `frame`: tape, whose spec has no
// parent yet, goes in the frame, and a title keeps its letters in the title.
const inside = (frame: number, specs: NewNode[], base: number): NewNode[] =>
  specs.map((s) => ({ ...s, parent: s.parent === undefined ? { ref: frame } : typeof s.parent === "object" ? { ref: s.parent.ref + base } : s.parent }));

// A page with things already on it, to fill in. It is a frame, so it is laid
// out like any other and lands in the flow at `order`.
export function starterSpecs(id: StarterId, words: Words, at: { x: number; y: number }, order: number): NewNode[] {
  const size = id === "postcard" ? "strip" : id === "notes" ? "square" : "poster";
  const look = id === "cover" ? "slate" : id === "postcard" ? "cream" : "sky";
  const frame = newFrame(size, look, order, at, STARTERS.find((s) => s.id === id)?.name);
  const out: NewNode[] = [frame];
  if (id === "cover") {
    const text = [...words.title.trim()].slice(0, 22).join("") || "Our trip";
    const letters = [...text].length;
    const title = newTitle(text, { x: frame.w / 2, y: frame.h * 0.4 }, Math.max(56, Math.min(130, Math.round(1000 / (letters * 0.7)))), words.title);
    out.push(...inside(0, title, out.length));
    out.push(scrap(0, words.dates ?? "Summer, together", "paper", frame.w / 2 - 190, frame.h * 0.66, 380, 110, -2));
    out.push(...inside(0, [newTape("washi-red", { x: 220, y: 90 }), newTape("washi-yellow", { x: frame.w - 220, y: 90 })], out.length));
  } else if (id === "postcard") {
    out.push(scrap(0, "Wish you were here!", "kraft", 80, 70, 560, 280, -2));
    out.push(scrap(0, "Dear you,\nWe saw the sea today.", "paper", 760, 90, 480, 240, 2));
    out.push(...inside(0, [newTape("tape", { x: 360, y: 60 }), newTape("washi-blue", { x: 1000, y: 80 })], out.length));
  } else {
    out.push(scrap(0, "The best thing we ate", "rose", 70, 90, 380, 190, -3));
    out.push(scrap(0, "The funniest moment", "sun", 480, 330, 380, 190, 2));
    out.push(scrap(0, "What we won't forget", "paper", 110, 600, 380, 190, -1));
    out.push(...inside(0, [newTape("washi-red", { x: 260, y: 90 }), newTape("tape", { x: 670, y: 330 })], out.length));
  }
  return out;
}
