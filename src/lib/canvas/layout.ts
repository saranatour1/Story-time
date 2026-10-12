import { dayKey } from "../photo-groups";
import { seeded } from "./look";

// Where things go on a canvas so that nothing lands on top of anything else:
// pages in a grid with a gap between them, pieces on a page in a grid, and a
// nudge that clears a frame dropped on another. All in world units, where a
// poster frame is 1200 wide. These are pure, so they can be tested.

export type Box = { x: number; y: number; w: number; h: number };

// The space between frames: about 2.5 cm on screen at the zoom a canvas opens at.
export const GAP = 200;
// Frames in a row before the next row starts.
const PER_ROW = 3;
// A page's margin, the room for its heading, and a moment's size and spacing.
const PAD = 60;
const HEAD = 170;
export const CELL = { w: 420, h: 360 };
const GUTTER = 40;

// ---- Pages: one frame for each day ---------------------------------------------

export type Page = {
  // The day, as its frame is named.
  name: string;
  // Where it happened, for the heading.
  note: string | undefined;
  ids: string[];
};

type Dated = { _id: string; startsAt: number; tzOffsetMinutes?: number; place?: string };

// Moments grouped by the day they happened in the zone they happened in, in
// order. `offset` is the zone for those saved without one.
export function pagesOf(moments: Dated[], offset: number): Page[] {
  const days = new Map<string, { at: number; list: Dated[] }>();
  for (const m of [...moments].sort((a, b) => a.startsAt - b.startsAt)) {
    const key = dayKey(m.startsAt, m.tzOffsetMinutes ?? offset);
    const day = days.get(key) ?? { at: m.startsAt + (m.tzOffsetMinutes ?? offset) * 60_000, list: [] };
    day.list.push(m);
    days.set(key, day);
  }
  return [...days.values()].map(({ at, list }) => {
    const places = [...new Set(list.flatMap((m) => (m.place === undefined ? [] : [m.place.split(",")[0]!.trim()])))];
    return {
      // The offset is already in `at`, so it is read as UTC.
      name: new Date(at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      note: places.length === 0 ? undefined : places.slice(0, 3).join(" · "),
      ids: list.map((m) => m._id),
    };
  });
}

// A page for `n` moments: how many columns, and how big it is.
export function pageFor(n: number): { cols: number; w: number; h: number } {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, w: PAD * 2 + cols * CELL.w + (cols - 1) * GUTTER, h: HEAD + rows * CELL.h + (rows - 1) * GUTTER + PAD };
}

// Where moment `i` goes on a page, and how big it is.
export function cellOf(i: number, cols: number): Box {
  return { x: PAD + (i % cols) * (CELL.w + GUTTER), y: HEAD + Math.floor(i / cols) * (CELL.h + GUTTER), w: CELL.w, h: CELL.h };
}

export const HEADING: Box = { x: PAD, y: 40, w: 520, h: 110 };

// ---- Frames, kept apart --------------------------------------------------------

// Where each of `sizes` goes: left to right, a few to a row, `GAP` between them,
// starting at `origin`.
export function packFrames(sizes: Array<Pick<Box, "w" | "h">>, origin: { x: number; y: number }): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let x = origin.x;
  let y = origin.y;
  let tallest = 0;
  for (const [i, s] of sizes.entries()) {
    if (i > 0 && i % PER_ROW === 0) {
      x = origin.x;
      y += tallest + GAP;
      tallest = 0;
    }
    out.push({ x, y });
    x += s.w + GAP;
    tallest = Math.max(tallest, s.h);
  }
  return out;
}

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

// A box moved the shortest way off any of `others`, leaving `gap` between.
// Moving off one can land it on another, so it tries a few times, and gives up
// on a crowd rather than loop.
export function clearOf(box: Box, others: Box[], gap = GAP): { x: number; y: number } {
  let { x, y } = box;
  for (let pass = 0; pass < 24; pass++) {
    const here = { ...box, x, y };
    const hit = others.find((o) => overlaps(here, o, gap));
    if (hit === undefined) break;
    const ways = [
      { x: hit.x + hit.w + gap, y },
      { x: hit.x - gap - box.w, y },
      { x, y: hit.y + hit.h + gap },
      { x, y: hit.y - gap - box.h },
    ];
    const shortest = ways.reduce((best, w) => (Math.hypot(w.x - x, w.y - y) < Math.hypot(best.x - x, best.y - y) ? w : best));
    x = shortest.x;
    y = shortest.y;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

// ---- Pieces on a page ----------------------------------------------------------

// The first place in a frame, reading left to right and top to bottom, where a
// piece of `size` fits without touching anything in `taken`. Nothing if the
// page is full.
export function freeSpot(frame: Pick<Box, "w" | "h">, taken: Box[], size: Pick<Box, "w" | "h">, margin = 24): { x: number; y: number } | undefined {
  const step = 30;
  for (let y = margin; y + size.h <= frame.h - margin; y += step) {
    for (let x = margin; x + size.w <= frame.w - margin; x += step) {
      const here = { x, y, ...size };
      if (!taken.some((t) => overlaps(here, t, 12))) return { x, y };
    }
  }
  return undefined;
}

// Room at the top of a frame for a heading or title that is already there.
export function topMargin(kids: Box[], frameH: number): number {
  const heads = kids.filter((k) => k.y < frameH * 0.3);
  return heads.length === 0 ? PAD : Math.min(frameH * 0.4, Math.max(PAD, ...heads.map((k) => k.y + k.h + GUTTER)));
}

export type Arrangement = "grid" | "scrapbook" | "strip";
export type Placed = { id: string; x: number; y: number; w: number; h: number; rotation: number };

// `pieces` laid out on a page of `frame` size below `top`, in the order given.
// Each keeps its shape and is fitted to its cell; a grid sits square, a
// scrapbook tips them a little and moves each off centre, a strip is one row.
export function arrange(
  pieces: Array<{ id: string; w: number; h: number }>,
  frame: Pick<Box, "w" | "h">,
  top: number,
  mode: Arrangement,
  seed = "arrange",
): Placed[] {
  const n = pieces.length;
  if (n === 0) return [];
  const area = { x: PAD, y: top, w: frame.w - PAD * 2, h: Math.max(120, frame.h - top - PAD) };
  const cols = mode === "strip" ? n : Math.max(1, Math.min(n, Math.round(Math.sqrt((n * area.w) / area.h))));
  const rows = Math.ceil(n / cols);
  const cw = (area.w - (cols - 1) * GUTTER) / cols;
  const ch = (area.h - (rows - 1) * GUTTER) / rows;
  const rnd = seeded(seed);
  return pieces.map((p, i) => {
    const fit = Math.min(cw / p.w, ch / p.h) * (mode === "scrapbook" ? 0.92 : 1);
    const w = Math.round(p.w * fit);
    const h = Math.round(p.h * fit);
    const jx = mode === "scrapbook" ? (rnd() - 0.5) * Math.min(24, cw * 0.06) : 0;
    const jy = mode === "scrapbook" ? (rnd() - 0.5) * Math.min(24, ch * 0.06) : 0;
    return {
      id: p.id,
      x: Math.round(area.x + (i % cols) * (cw + GUTTER) + (cw - w) / 2 + jx),
      y: Math.round(area.y + Math.floor(i / cols) * (ch + GUTTER) + (ch - h) / 2 + jy),
      w,
      h,
      rotation: mode === "scrapbook" ? Math.round((rnd() - 0.5) * 8) : 0,
    };
  });
}

// ---- Snapping ------------------------------------------------------------------

// How far `box` should move to sit its edges or middle on those of `targets`
// when they come within `near`, and the lines it settled on (for guides).
export function snap(box: Box, targets: Box[], near: number): { dx: number; dy: number; x?: number; y?: number } {
  const closest = (mine: number[], theirs: number[]) => {
    let best: { d: number; at: number } | undefined;
    for (const m of mine) {
      for (const t of theirs) {
        const d = t - m;
        if (Math.abs(d) <= near && (best === undefined || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
      }
    }
    return best;
  };
  const xs = closest([box.x, box.x + box.w / 2, box.x + box.w], targets.flatMap((t) => [t.x, t.x + t.w / 2, t.x + t.w]));
  const ys = closest([box.y, box.y + box.h / 2, box.y + box.h], targets.flatMap((t) => [t.y, t.y + t.h / 2, t.y + t.h]));
  return { dx: xs?.d ?? 0, dy: ys?.d ?? 0, x: xs?.at, y: ys?.at };
}
