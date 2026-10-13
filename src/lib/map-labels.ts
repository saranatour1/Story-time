// A label as a box: its centre and size, in one unit for every box (screen
// pixels, or the units of a drawn sheet), and how much it matters.
export type LabelBox = { id: string; x: number; y: number; width: number; height: number; priority: number };

// The ids of the labels that can be shown without crowding one another. The
// most important go first; a box is dropped when it overlaps, within `pad`, a
// box already kept. Equal priorities keep the order they came in.
export const thinLabels = (boxes: LabelBox[], pad = 0): Set<string> => {
  const ranked = boxes
    .map((box, order) => ({ box, order }))
    .sort((a, b) => b.box.priority - a.box.priority || a.order - b.order);
  const kept: LabelBox[] = [];
  for (const { box } of ranked) {
    if (!kept.some((other) => overlaps(box, other, pad))) kept.push(box);
  }
  return new Set(kept.map((box) => box.id));
};

// Two boxes overlap when their centres are nearer than half their sizes added
// up, grown by the padding, on both axes. Touching boxes don't overlap at zero.
const overlaps = (a: LabelBox, b: LabelBox, pad: number): boolean => {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad;
};
