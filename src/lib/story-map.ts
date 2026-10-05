// Places have no coordinates (they're encrypted free text), so the map is a
// drawn one: every stop gets a fixed spot on a 100 x 60 sheet, laid along a
// gentle left-to-right curve so each leg reads in story order. The vertical
// wobble is seeded by the label, so the same place always lands in the same
// spot within an experience.

export type MapPoint = { x: number; y: number };

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 60;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Positions for an ordered list of unique place labels.
export function layoutPlaces(labels: string[]): Map<string, MapPoint> {
  const unique = [...new Set(labels)];
  const points = new Map<string, MapPoint>();
  const n = unique.length;
  unique.forEach((label, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 10 + t * 80;
    // Alternate above and below the midline, nudged by the label's hash so
    // repeated trips don't all look identical.
    const side = i % 2 === 0 ? -1 : 1;
    const y = 30 + side * (8 + hash(label) * 12);
    points.set(label, { x: round(x), y: round(y) });
  });
  return points;
}

const round = (v: number) => Math.round(v * 100) / 100;

// A single leg as an SVG path. Planes arc high, boats roll, everything else
// bends a little so the icon has somewhere to go.
export function legPath(from: MapPoint, to: MapPoint, transport: string): string {
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
}

// Seconds the icon takes to cross a leg.
export function legDuration(transport: string): number {
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
}
