// The longest side of a thumbnail, and its JPEG quality: small enough for the
// AI to look at without the call growing much.
const SIDE = 512;
const QUALITY = 0.7;
// What lists and thumbnails fetch instead of the original.
const DISPLAY_SIDE = 480;

// One decode at a time: each one holds a full-size photo in memory, and a few
// at once could exhaust a phone's.
let turn: Promise<unknown> = Promise.resolve();
const made = new WeakMap<File, Promise<string | undefined>>();

// A small base64 JPEG (no data: prefix) of a picture, for the AI. Videos, and
// pictures the browser can't decode, give undefined. Memoized per file, so a
// thumbnail started early costs nothing when it's needed.
export const thumbnail = (file: File): Promise<string | undefined> => {
  if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
  let thumb = made.get(file);
  if (!thumb) {
    // `shrink` never rejects, so a failed one doesn't stop the line behind it.
    thumb = turn.then(() => shrink(file));
    turn = thumb;
    made.set(file, thumb);
  }
  return thumb;
};

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

const shrink = async (file: File): Promise<string | undefined> => {
  let bitmap: ImageBitmap | undefined;
  try {
    // Apply the camera's rotation, so the thumbnail is upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const jpeg = await encode(bitmap, width, height);
    return jpeg ? base64(new Uint8Array(await jpeg.arrayBuffer())) : undefined;
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

const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  // In chunks: spreading a whole photo into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
