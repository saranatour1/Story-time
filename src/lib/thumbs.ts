const DISPLAY_SIDE = 480;
const QUALITY = 0.7;

let turn: Promise<unknown> = Promise.resolve();

const oneDecodeAtATime = <T>(decode: () => Promise<T>): Promise<T> => {
  const job = turn.then(decode);
  turn = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
};

export const displayThumbnail = (
  file: File,
): Promise<{ blob: Blob; width: number; height: number } | undefined> => {
  if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
  return oneDecodeAtATime(() => makeDisplay(file));
};

const FIT_SIDES = [4096, 3072, 2048];
const FIT_QUALITY = 0.85;

export const fitPhoto = (file: File, maxBytes: number): Promise<Blob | undefined> => {
  return oneDecodeAtATime(() => makeFit(file, maxBytes));
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
