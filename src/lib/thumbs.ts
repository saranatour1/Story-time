// What lists and thumbnails fetch instead of the original, and its JPEG quality.
const DISPLAY_SIDE = 480;
const QUALITY = 0.7;

// One decode at a time: each one holds a full-size photo in memory, and a few
// at once could exhaust a phone's.
let turn: Promise<unknown> = Promise.resolve();

// A JPEG small enough for a shelf or a card, plus the original's pixel size
// so the layout can reserve the right box. Videos give undefined.
export const displayThumbnail = (
  file: File,
): Promise<{ blob: Blob; width: number; height: number } | undefined> => {
  if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
  const job = turn.then(() => makeDisplay(file));
  turn = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
};

// Longest sides tried, largest first, when a photo is too big to upload as is.
const FIT_SIDES = [4096, 3072, 2048];
const FIT_QUALITY = 0.85;

// A JPEG of the photo that fits in `maxBytes`, for phone photos over the
// upload cap. Undefined when it can't be decoded or won't fit. Like the
// canvas it comes from, it carries no camera details.
export const fitPhoto = (file: File, maxBytes: number): Promise<Blob | undefined> => {
  const job = turn.then(() => makeFit(file, maxBytes));
  turn = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
};

const makeFit = async (file: File, maxBytes: number): Promise<Blob | undefined> => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    for (const side of FIT_SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const blob = await encode(
        bitmap,
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
        FIT_QUALITY,
      );
      if (blob && blob.size <= maxBytes) return blob;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    bitmap?.close();
  }
};

const makeDisplay = async (
  file: File,
): Promise<{ blob: Blob; width: number; height: number } | undefined> => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, DISPLAY_SIDE / Math.max(bitmap.width, bitmap.height));
    const blob = await encode(
      bitmap,
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    return blob ? { blob, width: bitmap.width, height: bitmap.height } : undefined;
  } catch {
    return undefined;
  } finally {
    bitmap?.close();
  }
};

// OffscreenCanvas where the browser has it, else a <canvas> element.
const encode = async (
  source: ImageBitmap,
  width: number,
  height: number,
  quality = QUALITY,
): Promise<Blob | null> => {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
};
