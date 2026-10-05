import { expect, test } from "vitest";
import { fitBounds, layoutLngLats, legCoordinates, pointToLngLat } from "./story-geo";

test("place labels map to stable longitude / latitude", () => {
  const a = layoutLngLats(["Lisbon", "Porto", "Lisbon"]);
  const b = layoutLngLats(["Lisbon", "Porto", "Lisbon"]);
  expect([...a.entries()]).toEqual([...b.entries()]);
  expect(a.size).toBe(2);
  for (const [lng, lat] of a.values()) {
    expect(lng).toBeGreaterThanOrEqual(-12);
    expect(lng).toBeLessThanOrEqual(8);
    expect(lat).toBeGreaterThanOrEqual(36);
    expect(lat).toBeLessThanOrEqual(52);
  }
});

test("sheet origin maps into the atlas", () => {
  const [lng, lat] = pointToLngLat({ x: 0, y: 0 });
  expect(lng).toBe(-12);
  expect(lat).toBe(52);
});

test("a leg has enough samples to animate and keeps its ends", () => {
  const from: [number, number] = [-9, 38.7];
  const to: [number, number] = [-8.6, 41.1];
  const coords = legCoordinates(from, to, "train");
  expect(coords.length).toBeGreaterThan(8);
  expect(coords[0]).toEqual(from);
  expect(coords.at(-1)).toEqual(to);
});

test("fitBounds keeps a usable zoom", () => {
  const { zoom, center } = fitBounds([
    [-9, 38],
    [-8, 41],
  ]);
  expect(zoom).toBeGreaterThan(3);
  expect(zoom).toBeLessThan(9);
  expect(center[0]).toBeCloseTo(-8.5, 1);
});
