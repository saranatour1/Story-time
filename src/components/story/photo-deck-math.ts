import type { Stop } from "@/lib/story-steps";

export const PHOTO_MS = 2500;

export type Picture = Extract<Stop["blocks"][number], { type: "photo" | "video" }>;

export const picturesOf = (stop: Stop): Picture[] =>
  stop.blocks.filter((b): b is Picture => b.type === "photo" || b.type === "video");

export type Words = Extract<Stop["blocks"][number], { type: "note" | "feeling" }>;

export const wordsOf = (stop: Stop): Words[] =>
  stop.blocks.filter((b): b is Words => b.type === "note" || b.type === "feeling");

export const dwellMs = (count: number) => Math.max(5000, count * PHOTO_MS + 1000);

export const clampIndex = (index: number, count: number) =>
  Math.min(Math.max(index, 0), Math.max(count - 1, 0));
export const nextIndex = (index: number, count: number, delta: 1 | -1) =>
  clampIndex(index + delta, count);
export const atEdge = (index: number, count: number, delta: 1 | -1) =>
  index + delta < 0 || index + delta >= count;
export const tapDelta = (x: number, width: number): 1 | -1 => (x < width / 3 ? -1 : 1);
export const tiltOf = (index: number) => ((index * 37) % 7) - 3;
