const ascii = (head: Uint8Array, at: number, text: string): boolean => {
  return [...text].every((ch, i) => head[at + i] === ch.charCodeAt(0));
};
const bytes = (head: Uint8Array, ...want: number[]): boolean => {
  return want.every((b, i) => head[i] === b);
};
const BOX_SIZE_FIELD_BYTES = 4;
const box = (head: Uint8Array, ...names: string[]): boolean => {
  return names.some((name) => ascii(head, BOX_SIZE_FIELD_BYTES, name));
};

const SIGNATURES: Partial<Record<string, (head: Uint8Array) => boolean>> = {
  "image/jpeg": (h) => bytes(h, 0xff, 0xd8, 0xff),
  "image/png": (h) => bytes(h, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  "image/gif": (h) => ascii(h, 0, "GIF87a") || ascii(h, 0, "GIF89a"),
  "image/webp": (h) => ascii(h, 0, "RIFF") && ascii(h, 8, "WEBP"),
  "image/avif": (h) => box(h, "ftyp") && (ascii(h, 8, "avif") || ascii(h, 8, "avis")),
  "video/mp4": (h) => box(h, "ftyp"),
  // Older QuickTime files open with another box than ftyp.
  "video/quicktime": (h) => box(h, "ftyp", "moov", "mdat", "wide", "free", "skip"),
  "video/webm": (h) => bytes(h, 0x1a, 0x45, 0xdf, 0xa3),
};

export const looksLike = (head: Uint8Array, mime: string): boolean => {
  return SIGNATURES[mime]?.(head) ?? false;
};

const HEAD_BYTES = 16;

export const peek = async (
  body: ReadableStream<Uint8Array>,
): Promise<{ head: Uint8Array; body: ReadableStream<Uint8Array> }> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let have = 0;
  while (have < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    have += value.byteLength;
  }
  const head = new Uint8Array(Math.min(have, HEAD_BYTES));
  let at = 0;
  for (const chunk of chunks) {
    head.set(chunk.subarray(0, head.length - at), at);
    at += Math.min(chunk.byteLength, head.length - at);
    if (at === head.length) break;
  }
  const rest = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { head, body: rest };
};
