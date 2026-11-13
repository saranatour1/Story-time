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

export const stripExif = async (file: File): Promise<Blob> => {
  if (file.type !== "image/jpeg") return file;
  const stripped = withoutExif(new Uint8Array(await file.arrayBuffer()));
  return stripped ? new Blob([stripped], { type: file.type }) : file;
};
