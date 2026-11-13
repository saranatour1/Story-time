export const SHELF_LIMIT = 24;
export const SHELF_TILE_PX = 56;
export const SHELF_GAP_PX = 6;
export const ORIGINAL_BYTES = 1_725_503;
export const THUMB_BYTES = 28_172;

export type MountedImage = { id: string; role: "list" | "page"; visible: boolean };

export const visibleTiles = (viewportPx: number): number => {
  if (viewportPx <= 0) return 0;
  return Math.min(
    SHELF_LIMIT,
    Math.max(0, Math.floor((viewportPx + SHELF_GAP_PX) / (SHELF_TILE_PX + SHELF_GAP_PX))),
  );
};

export type ImageWork = {
  fetches: number;
  decodes: number;
  full: number;
  thumbs: number;
  bytes: number;
};

const work = (images: MountedImage[], thumbs: boolean): ImageWork => {
  const full = images.filter((image) => !thumbs || image.role === "page").length;
  const thumbCount = images.length - full;
  return {
    fetches: images.length,
    decodes: images.length,
    full,
    thumbs: thumbCount,
    bytes: full * ORIGINAL_BYTES + thumbCount * THUMB_BYTES,
  };
};

export const imageWorkBefore = (images: MountedImage[]): ImageWork => {
  return work(images, false);
};

export const imageWorkAfter = (images: MountedImage[]): ImageWork => {
  return work(
    images.filter((image) => image.visible),
    true,
  );
};

export const evictUnused = <T>(
  cache: Map<string, T>,
  max: number,
  idle: (entry: T) => boolean,
  drop: (entry: T) => void,
): void => {
  for (const [id, entry] of cache) {
    if (cache.size <= max) return;
    if (!idle(entry)) continue;
    drop(entry);
    cache.delete(id);
  }
};
