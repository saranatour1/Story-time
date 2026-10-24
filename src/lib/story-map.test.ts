import { expect, test } from "vite-plus/test";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  layoutPlaces,
  legDuration,
  legPath,
  placeNames,
  sheetSize,
} from "./story-map";

test("layout is deterministic and keeps every place on the sheet", () => {
  const labels = ["Lisbon", "Sintra", "Porto", "Lisbon", "Gaia"];
  const a = layoutPlaces(labels);
  const b = layoutPlaces(labels);
  expect([...a.entries()]).toEqual([...b.entries()]);
  expect(a.size).toBe(4);
  for (const p of a.values()) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(MAP_WIDTH);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(MAP_HEIGHT);
  }
});

test("places are spread left to right in story order and don't overlap", () => {
  const points = [...layoutPlaces(["A", "B", "C", "D", "E", "F"]).values()];
  for (let i = 1; i < points.length; i++) {
    expect(points[i]!.x).toBeGreaterThan(points[i - 1]!.x);
    expect(
      Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y),
    ).toBeGreaterThan(10);
  }
});

test("held upright, places run top to bottom on a tall sheet", () => {
  const { w, h } = sheetSize("portrait");
  expect(h).toBeGreaterThan(w);
  const points = [...layoutPlaces(["A", "B", "C", "D", "E", "F"], "portrait").values()];
  points.forEach((p, i) => {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(w);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(h);
    const prev = points[i - 1];
    if (!prev) return;
    expect(p.y).toBeGreaterThan(prev.y);
    expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeGreaterThan(10);
  });
});

test("a lone place sits in the middle", () => {
  expect(layoutPlaces(["Home"]).get("Home")?.x).toBe(50);
  expect(layoutPlaces(["Home"], "portrait").get("Home")?.y).toBe(50);
});

test("leg paths start and end at the given points", () => {
  const from = { x: 10, y: 20 };
  const to = { x: 90, y: 40 };
  for (const t of ["walk", "train", "plane", "boat"]) {
    const d = legPath(from, to, t);
    expect(d.startsWith("M 10 20")).toBe(true);
    expect(d.endsWith("90 40")).toBe(true);
  }
  // Boats roll with two curves; everything else bends once.
  expect(legPath(from, to, "boat").match(/Q/g)?.length).toBe(2);
  expect(legPath(from, to, "plane").match(/Q/g)?.length).toBe(1);
});

test("walking takes longer than flying", () => {
  expect(legDuration("walk")).toBeGreaterThan(legDuration("plane"));
});

// A busy trip: twenty places close together on the sheet, some revisited.
const busy = [
  "Kyoto in November",
  "Kyoto Station",
  "Kiyomizu-dera",
  "Fushimi Inari Taisha",
  "Arashiyama Bamboo Grove",
  "Gion",
  "Kansai Airport",
  "Nara",
  "Osaka",
  "Tokyo",
  "Kinkaku-ji",
  "Nishiki Market",
  "Ginkaku-ji",
  "Philosopher's Path",
  "Tofuku-ji",
  "Nijo Castle",
  "Sanjusangen-do",
  "Shinjuku",
  "Shibuya",
  "Gion",
];

test("drawn names that show never crowd one another", () => {
  for (const orientation of ["landscape", "portrait"] as const) {
    const names = placeNames(layoutPlaces(busy, orientation), {
      sheet: sheetSize(orientation).w,
      portrait: orientation === "portrait",
      active: "Gion",
      origin: busy[0],
      visited: new Set(busy.slice(0, 6)),
    });
    const boxes = [...names.values()].map((n) => n.box);
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        expect(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
            Math.abs(a.y - b.y) >= (a.height + b.height) / 2,
        ).toBe(true);
      }
    });
  }
});

test("across the sheet, names that would crowd are left out, the place in focus and the origin kept", () => {
  const points = layoutPlaces(busy);
  const names = placeNames(points, {
    sheet: MAP_WIDTH,
    portrait: false,
    active: "Gion",
    origin: busy[0],
    visited: new Set(busy.slice(0, 6)),
  });
  expect(names.size).toBeLessThan(points.size);
  expect(names.has("Gion")).toBe(true);
  expect(names.has(busy[0])).toBe(true);
});
