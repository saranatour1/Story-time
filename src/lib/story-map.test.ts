import { expect, test } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, layoutPlaces, legDuration, legPath } from "./story-map";

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
    expect(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)).toBeGreaterThan(10);
  }
});

test("a lone place sits in the middle", () => {
  expect(layoutPlaces(["Home"]).get("Home")?.x).toBe(50);
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
