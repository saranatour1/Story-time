import type { Stop } from "@/lib/story-steps";

// How long each picture stays up while autoplay turns them.
export const PHOTO_MS = 2500;

export type Picture = Extract<Stop["blocks"][number], { type: "photo" | "video" }>;

export const picturesOf = (stop: Stop): Picture[] =>
  stop.blocks.filter((b): b is Picture => b.type === "photo" || b.type === "video");

export type Words = Extract<Stop["blocks"][number], { type: "note" | "feeling" }>;

// What was written at a stop: its notes and feelings, in order.
export const wordsOf = (stop: Stop): Words[] =>
  stop.blocks.filter((b): b is Words => b.type === "note" || b.type === "feeling");

// How long a stop's scene stays up while autoplay moves through it: its pictures
// take their turns, then the last one has a beat before the story moves on.
export const dwellMs = (count: number) => Math.max(5000, count * PHOTO_MS + 1000);

export const clampIndex = (index: number, count: number) =>
  Math.min(Math.max(index, 0), Math.max(count - 1, 0));
export const nextIndex = (index: number, count: number, delta: 1 | -1) =>
  clampIndex(index + delta, count);
// A step that would leave the pictures is the story's to take.
export const atEdge = (index: number, count: number, delta: 1 | -1) =>
  index + delta < 0 || index + delta >= count;
// The left third of the deck goes back, the rest forward.
export const tapDelta = (x: number, width: number): 1 | -1 => (x < width / 3 ? -1 : 1);
// A little tilt per card, always the same for the same place in the deck.
export const tiltOf = (index: number) => ((index * 37) % 7) - 3;
