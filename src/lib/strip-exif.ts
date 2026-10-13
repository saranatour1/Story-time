// APP1 (Exif, XMP) and APP2 (ICC) segments are where a camera writes where and
// when a photo was taken. Everything else is kept byte for byte.
const APP1 = 0xffe1;
const APP2 = 0xffe2;
// Start of the image data: nothing after it is a segment we'd drop.
const SOS = 0xffda;

// The JPEG without its APP1 and APP2 segments, or null for anything that
// doesn't walk cleanly, so the caller keeps the original.
export const withoutExif = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // SOI
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff || at + 4 > bytes.length) return null;
    const marker = 0xff00 | bytes[at + 1];
    // Markers without a length, and fill bytes, can't be walked past.
    if (marker < 0xffc0 || marker === 0xffff || (marker >= 0xffd0 && marker <= 0xffd9)) return null;
    if (marker === SOS) {
      kept.push(bytes.subarray(at));
      return concat(kept);
    }
    // The length counts its own two bytes, not the marker.
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker !== APP1 && marker !== APP2) kept.push(bytes.subarray(at, end));
    at = end;
  }
  return null; // ran out before the image data
};

const concat = (parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// A photo to upload: a JPEG without its camera details. Anything else, or a
// JPEG that doesn't parse, comes back as the file it was.
export const stripExif = async (file: File): Promise<Blob> => {
  if (file.type !== "image/jpeg") return file;
  const stripped = withoutExif(new Uint8Array(await file.arrayBuffer()));
  return stripped ? new Blob([stripped], { type: file.type }) : file;
};
