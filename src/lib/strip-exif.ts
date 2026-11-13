const APP1 = 0xffe1;
const APP2 = 0xffe2;
const SOS = 0xffda;

const isStandaloneOrFill = (marker: number): boolean =>
  marker < 0xffc0 || marker === 0xffff || (marker >= 0xffd0 && marker <= 0xffd9);

export const withoutExif = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff || at + 4 > bytes.length) return null;
    const marker = 0xff00 | bytes[at + 1];
    if (isStandaloneOrFill(marker)) return null;
    if (marker === SOS) {
      kept.push(bytes.subarray(at));
      return concat(kept);
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker !== APP1 && marker !== APP2) kept.push(bytes.subarray(at, end));
    at = end;
  }
  return null;
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

const ascii = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
const be32 = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const le32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

// EXIF, and the text chunks XMP and comments live in. Colour (iCCP) stays.
const PNG_DROPPED = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

export const pngWithoutMeta = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | null => {
  if (bytes.length < 8 || be32(bytes, 0) !== 0x89504e47) return null;
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const type = ascii(bytes, at + 4);
    const end = at + 12 + be32(bytes, at);
    if (end > bytes.length) return null;
    if (!PNG_DROPPED.has(type)) kept.push(bytes.subarray(at, end));
    if (type === "IEND") return concat(kept);
    at = end;
  }
  return null;
};

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

export const webpWithoutMeta = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | null => {
  if (bytes.length < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WEBP") return null;
  const kept: Uint8Array<ArrayBuffer>[] = [];
  let at = 12;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return null;
    const type = ascii(bytes, at);
    const end = at + 8 + le32(bytes, at + 4) + (le32(bytes, at + 4) % 2);
    if (end > bytes.length) return null;
    if (type === "VP8X") {
      const chunk = bytes.slice(at, end);
      chunk[8] = chunk[8]! & ~(VP8X_EXIF | VP8X_XMP);
      kept.push(chunk);
    } else if (type !== "EXIF" && type !== "XMP ") kept.push(bytes.subarray(at, end));
    at = end;
  }
  const body = concat(kept);
  const out = new Uint8Array(new ArrayBuffer(12 + body.length));
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
};

const STRIPPERS: Record<string, (b: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> | null> = {
  "image/jpeg": withoutExif,
  "image/png": pngWithoutMeta,
  "image/webp": webpWithoutMeta,
};

// ponytail: AVIF and GIF go up as they are; AVIF can carry EXIF too, strip it
// here if phones start sending AVIF.
export const stripExif = async (file: File): Promise<Blob> => {
  const strip = STRIPPERS[file.type];
  if (!strip) return file;
  const stripped = strip(new Uint8Array(await file.arrayBuffer()));
  return stripped ? new Blob([stripped], { type: file.type }) : file;
};
