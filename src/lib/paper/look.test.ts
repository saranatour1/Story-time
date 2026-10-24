import { describe, expect, test } from "vite-plus/test";
import { FRAME_LOOKS, PAPERS, seeded, tornPolygon } from "./look";

describe("looks", () => {
  test("the same seed gives the same numbers, another seed doesn't", () => {
    const a = seeded("piece-1");
    const b = seeded("piece-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded("piece-2")()).not.toBe(seeded("piece-1")());
  });

  test("a torn edge is the same every time, and only wobbles the sides asked for", () => {
    const edges = { top: true };
    expect(tornPolygon("x", edges)).toBe(tornPolygon("x", edges));
    expect(tornPolygon("x", edges)).not.toBe(tornPolygon("y", edges));
    // the bottom edge stays at 100%
    const polygon = tornPolygon("x", edges);
    expect(polygon).toContain("0.00% 100.00%");
    expect(polygon.startsWith("polygon(")).toBe(true);
  });

  test("every page and paper has real colours", () => {
    const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
    for (const l of FRAME_LOOKS) expect([l.page, l.ink, l.accent].every(hex)).toBe(true);
    for (const p of PAPERS) expect([p.page, p.ink].every(hex)).toBe(true);
  });
});
