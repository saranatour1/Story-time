import { describe, expect, test } from "vite-plus/test";
import {
  atEdge,
  clampIndex,
  dwellMs,
  nextIndex,
  PHOTO_MS,
  tapDelta,
  tiltOf,
} from "./photo-deck-math";

describe("picture index", () => {
  test("clampIndex holds an index inside the pictures", () => {
    expect([clampIndex(-1, 3), clampIndex(1, 3), clampIndex(5, 3), clampIndex(0, 0)]).toEqual([
      0, 1, 2, 0,
    ]);
  });

  test("nextIndex steps one picture and stays at the ends", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(2);
    expect(nextIndex(0, 3, -1)).toBe(0);
  });

  test("atEdge is true where a step would leave the pictures", () => {
    expect(atEdge(0, 3, -1)).toBe(true);
    expect(atEdge(0, 3, 1)).toBe(false);
    expect(atEdge(1, 3, -1)).toBe(false);
    expect(atEdge(2, 3, 1)).toBe(true);
  });

  test("a stop with one picture or none has no steps", () => {
    expect([atEdge(0, 1, 1), atEdge(0, 1, -1), atEdge(0, 0, 1), atEdge(0, 0, -1)]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe("tapDelta", () => {
  test("the left third goes back and the rest goes forward", () => {
    expect(tapDelta(10, 300)).toBe(-1);
    expect(tapDelta(99.9, 300)).toBe(-1);
    expect(tapDelta(100, 300)).toBe(1);
    expect(tapDelta(290, 300)).toBe(1);
  });
});

describe("dwellMs", () => {
  test("a stop holds for its pictures' turns, and never less than five seconds", () => {
    expect(dwellMs(0)).toBe(5000);
    expect(dwellMs(1)).toBe(5000);
    expect(dwellMs(2)).toBe(6000);
    expect(dwellMs(5)).toBe(13500);
    expect(dwellMs(3)).toBe(3 * PHOTO_MS + 1000);
  });
});

describe("tiltOf", () => {
  test("each card tilts a little, the same way every time", () => {
    const tilts = Array.from({ length: 30 }, (_, i) => tiltOf(i));
    expect(tilts.every((t) => t >= -3 && t <= 3)).toBe(true);
    expect(tiltOf(4)).toBe(tiltOf(4));
  });
});
