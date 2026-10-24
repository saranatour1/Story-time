import { expect, test } from "vite-plus/test";
import { type LabelBox, thinLabels } from "./map-labels";

// Ten wide and four tall, so two centres ten apart in x touch edge to edge.
const box = (id: string, x: number, y: number, priority = 0): LabelBox => ({
  id,
  x,
  y,
  width: 10,
  height: 4,
  priority,
});

test("of two overlapping labels, the more important one is kept", () => {
  expect(thinLabels([box("low", 0, 0, 1), box("high", 5, 0, 5)])).toEqual(new Set(["high"]));
  expect(thinLabels([box("high", 5, 0, 5), box("low", 0, 0, 1)])).toEqual(new Set(["high"]));
});

test("labels that don't overlap are all kept", () => {
  expect(thinLabels([box("a", 0, 0), box("b", 20, 0), box("c", 0, 10)])).toEqual(
    new Set(["a", "b", "c"]),
  );
  // Stacked with a gap between them, too.
  expect(thinLabels([box("a", 0, 0), box("b", 0, 5)])).toEqual(new Set(["a", "b"]));
});

test("touching labels don't overlap, but padding keeps them apart", () => {
  expect(thinLabels([box("a", 0, 0), box("b", 10, 0)])).toEqual(new Set(["a", "b"]));
  // A gap of four is clear on its own, not with a six-unit padding.
  expect(thinLabels([box("a", 0, 0), box("b", 14, 0)])).toEqual(new Set(["a", "b"]));
  expect(thinLabels([box("a", 0, 0, 2), box("b", 14, 0, 1)], 6)).toEqual(new Set(["a"]));
  expect(thinLabels([box("a", 0, 0, 2), box("b", 16, 0, 1)], 6)).toEqual(new Set(["a", "b"]));
});

test("a dropped label doesn't block the ones beneath it", () => {
  // Mid overlaps high and goes; low only overlapped mid, so it stays.
  expect(thinLabels([box("high", 0, 0, 3), box("mid", 8, 0, 2), box("low", 16, 0, 1)])).toEqual(
    new Set(["high", "low"]),
  );
});

test("equal priorities keep the order they came in", () => {
  expect(thinLabels([box("a", 0, 0, 1), box("b", 8, 0, 1), box("c", 16, 0, 1)])).toEqual(
    new Set(["a", "c"]),
  );
  expect(thinLabels([box("c", 16, 0, 1), box("b", 8, 0, 1), box("a", 0, 0, 1)])).toEqual(
    new Set(["c", "a"]),
  );
});

test("no labels keeps none", () => {
  expect(thinLabels([])).toEqual(new Set());
});
