export type LabelBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
};

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

const overlaps = (a: LabelBox, b: LabelBox, pad: number): boolean => {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad
  );
};
