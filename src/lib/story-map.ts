import { thinLabels, type LabelBox } from "./map-labels";

// Places have no coordinates (they're encrypted free text), so the map is a
// drawn one: every stop gets a fixed spot on a 100 x 60 sheet, laid along a
// gentle left-to-right zigzag so each leg reads in story order. Held upright
// (a phone), the sheet is 60 x 100 and the trip runs top to bottom. The
// wobble is seeded by the label, so the same place always lands in the same
// spot within an experience.

export type MapPoint = { x: number; y: number };
export type Orientation = "landscape" | "portrait";

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 60;

export const sheetSize = (o: Orientation) =>
  o === "portrait" ? { w: MAP_HEIGHT, h: MAP_WIDTH } : { w: MAP_WIDTH, h: MAP_HEIGHT };

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};

// Positions for an ordered list of unique place labels.
export const layoutPlaces = (
  labels: string[],
  orientation: Orientation = "landscape",
): Map<string, MapPoint> => {
  const unique = [...new Set(labels)];
  const points = new Map<string, MapPoint>();
  const n = unique.length;
  unique.forEach((label, i) => {
    const along = 10 + (n === 1 ? 0.5 : i / (n - 1)) * 80;
    // Alternate either side of the midline, nudged by the label's hash so
    // repeated trips don't all look identical. Upright, the zigzag is
    // narrower so labels fit beside it.
    const side = i % 2 === 0 ? -1 : 1;
    const p =
      orientation === "portrait"
        ? { x: 30 + side * (4 + hash(label) * 5), y: along }
        : { x: along, y: 30 + side * (8 + hash(label) * 12) };
    points.set(label, { x: round(p.x), y: round(p.y) });
  });
  return points;
};

const round = (v: number) => Math.round(v * 100) / 100;

// A single leg as an SVG path. Planes arc high, boats roll, everything else
// bends a little so the icon has somewhere to go.
export const legPath = (from: MapPoint, to: MapPoint, transport: string): string => {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal, pointing "up" on screen when travelling left to right.
  const nx = -dy / len;
  const ny = dx / len;
  if (transport === "plane") {
    const lift = Math.min(len * 0.6, 28);
    return `M ${from.x} ${from.y} Q ${round(mx + nx * lift)} ${round(my + ny * lift)} ${to.x} ${to.y}`;
  }
  if (transport === "boat") {
    const w = Math.min(len * 0.15, 5);
    const q1 = { x: from.x + dx * 0.25 + nx * w, y: from.y + dy * 0.25 + ny * w };
    const q2 = { x: from.x + dx * 0.75 - nx * w, y: from.y + dy * 0.75 - ny * w };
    return `M ${from.x} ${from.y} Q ${round(q1.x)} ${round(q1.y)} ${round(mx)} ${round(my)} Q ${round(q2.x)} ${round(q2.y)} ${to.x} ${to.y}`;
  }
  const bend = Math.min(len * 0.2, 8);
  return `M ${from.x} ${from.y} Q ${round(mx + nx * bend)} ${round(my + ny * bend)} ${to.x} ${to.y}`;
};

// Seconds the icon takes to cross a leg.
export const legDuration = (transport: string): number => {
  switch (transport) {
    case "walk":
      return 4;
    case "bike":
      return 3.5;
    case "boat":
      return 4;
    case "plane":
      return 2.5;
    default:
      return 3;
  }
};

// A place's name as drawn beside its dot: its text and side, and the box the
// estimate works from (about 1.3 units a letter, 3 units tall).
export type DrawnName = {
  text: string;
  left: boolean;
  gap: number;
  box: { x: number; y: number; width: number; height: number };
};

// How far apart drawn names are kept, in sheet units.
const NAME_PAD = 0.5;

const nameAt = (
  label: string,
  p: MapPoint,
  sheet: number,
  portrait: boolean,
  active: boolean,
): DrawnName => {
  // A label beside its place stays clear of the legs: across, they run left
  // to right, so it sits on the right (on the left near the right edge);
  // upright, they zigzag down the middle, so it sits on the outer side.
  const left = portrait ? p.x < sheet / 2 : p.x > sheet * 0.7;
  // The travelling icon parks on the active place, so its label moves out.
  const gap = active ? 4.4 : 2.6;
  // Cut to the room left before the sheet's edge, about 1.3 units a letter.
  const room = left ? p.x - gap - 1.5 : sheet - 1.5 - p.x - gap;
  const max = Math.max(4, Math.min(22, Math.floor(room / 1.3)));
  const text = label.length > max ? `${label.slice(0, max - 1)}…` : label;
  // The active name is set bold, so a little wider.
  const width = text.length * (active ? 1.43 : 1.3);
  const x = left ? p.x - gap - width / 2 : p.x + gap + width / 2;
  return { text, left, gap, box: { x, y: p.y + 0.25, width, height: 3 } };
};

// The names that show, each with where it sits. The place in focus keeps its
// name first, then the origin (the diamond), then the places already visited,
// then the rest. A name that would crowd one already kept is left out, and its
// place keeps just its dot.
export const placeNames = (
  points: Map<string, MapPoint>,
  {
    sheet,
    portrait,
    active,
    origin,
    visited,
  }: { sheet: number; portrait: boolean; active?: string; origin?: string; visited: Set<string> },
): Map<string, DrawnName> => {
  const laid = [...points].map(
    ([label, p]) => [label, nameAt(label, p, sheet, portrait, label === active)] as const,
  );
  const boxes: LabelBox[] = laid.map(([label, name]) => ({
    id: label,
    ...name.box,
    priority: label === active ? 100 : label === origin ? 90 : visited.has(label) ? 50 : 10,
  }));
  const kept = thinLabels(boxes, NAME_PAD);
  return new Map(laid.filter(([label]) => kept.has(label)));
};
