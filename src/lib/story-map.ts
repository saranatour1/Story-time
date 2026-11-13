import { thinLabels, type LabelBox } from "./map-labels";

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

export const layoutPlaces = (
  labels: string[],
  orientation: Orientation = "landscape",
): Map<string, MapPoint> => {
  const unique = [...new Set(labels)];
  const points = new Map<string, MapPoint>();
  const n = unique.length;
  unique.forEach((label, i) => {
    const along = 10 + (n === 1 ? 0.5 : i / (n - 1)) * 80;
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

export const legPath = (from: MapPoint, to: MapPoint, transport: string): string => {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
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

export type DrawnName = {
  text: string;
  left: boolean;
  gap: number;
  box: { x: number; y: number; width: number; height: number };
};

const NAME_PAD = 0.5;

const nameAt = (
  label: string,
  p: MapPoint,
  sheet: number,
  portrait: boolean,
  active: boolean,
): DrawnName => {
  const left = portrait ? p.x < sheet / 2 : p.x > sheet * 0.7;
  const gap = active ? 4.4 : 2.6;
  const room = left ? p.x - gap - 1.5 : sheet - 1.5 - p.x - gap;
  const max = Math.max(4, Math.min(22, Math.floor(room / 1.3)));
  const text = label.length > max ? `${label.slice(0, max - 1)}…` : label;
  const width = text.length * (active ? 1.43 : 1.3);
  const x = left ? p.x - gap - width / 2 : p.x + gap + width / 2;
  return { text, left, gap, box: { x, y: p.y + 0.25, width, height: 3 } };
};

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
