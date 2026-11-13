import type { StoryMoment } from "@/components/event/types";

export const playSurface = (
  pages: ReadonlyArray<{ momentId?: string }>,
  momentId: string | undefined,
): "book" | "story" => {
  if (pages.length === 0) return "story";
  if (momentId !== undefined && !pages.some((page) => page.momentId === momentId)) return "story";
  return "book";
};

export const pageForPlay = (
  pages: ReadonlyArray<{ momentId?: string }>,
  momentId: string | undefined,
): number => {
  if (momentId === undefined) return 0;
  const at = pages.findIndex((page) => page.momentId === momentId);
  return at < 0 ? 0 : at;
};

export const firstNote = (
  moment: Pick<StoryMoment, "blocks" | "stops"> | undefined,
): string | undefined => {
  if (moment === undefined) return undefined;
  const blocks = [moment.blocks, ...moment.stops.map((stop) => stop.blocks)].flat();
  for (const block of blocks) {
    if ((block.type === "note" || block.type === "feeling") && block.text) return block.text;
  }
  return undefined;
};

export const noteWasCut = (printed: string | undefined, full: string | undefined): boolean => {
  if (printed === undefined || full === undefined || !printed.endsWith("…")) return false;
  return full.length > printed.length - 1;
};
