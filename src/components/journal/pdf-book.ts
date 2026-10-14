// One A4 page at a time. The finished file holds every JPEG, because that is the
// download. What it does not do is keep a second copy of each page, or a canvas
// per page, while the rest are still being drawn.

export const PDF_SCALE = 1.5;
export const PDF_QUALITY = 0.75;

const A4_W = 595.28;
const A4_H = 841.89;

export class PdfCancelled extends Error {
  constructor() {
    super("Printing cancelled");
    this.name = "PdfCancelled";
  }
}

export const jpegSize = (bytes: Uint8Array): { width: number; height: number } => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("The page wasn't a JPEG.");
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    // Start-of-frame, other than DHT and DAC, carries the pixel size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0),
        width: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0),
      };
    }
    i += 2 + length;
  }
  throw new Error("The page wasn't a JPEG.");
};

// Same canvas while every page is the same size. A different size allocates once.
export const reuseCanvas = <T extends { width: number; height: number }>(
  current: T | null,
  width: number,
  height: number,
  make: (width: number, height: number) => T,
): { current: T; created: boolean } => {
  if (current && current.width === width && current.height === height)
    return { current, created: false };
  return { current: make(width, height), created: true };
};

type Part = string | Uint8Array;

export const assembleJournalPdf = async (
  count: number,
  jpegFor: (index: number) => Promise<Uint8Array>,
  opts: { signal?: AbortSignal; onProgress?: (done: number) => void } = {},
): Promise<Uint8Array> => {
  if (!Number.isInteger(count) || count < 1) throw new Error("Nothing to print.");
  const parts: Part[] = [];
  let at = 0;
  const add = (part: Part) => {
    parts.push(part);
    at += typeof part === "string" ? part.length : part.byteLength;
  };
  const offsets: number[] = [];
  const object = (n: number, dict: string, stream?: Uint8Array) => {
    offsets[n] = at;
    if (stream) {
      add(`${n} 0 obj\n${dict}\nstream\n`);
      add(stream);
      add("\nendstream\nendobj\n");
    } else {
      add(`${n} 0 obj\n${dict}\nendobj\n`);
    }
  };

  const kids = Array.from({ length: count }, (_, i) => `${3 + i * 3} 0 R`).join(" ");
  add("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);

  for (let i = 0; i < count; i++) {
    if (opts.signal?.aborted) throw new PdfCancelled();
    const jpeg = await jpegFor(i);
    if (opts.signal?.aborted) throw new PdfCancelled();
    const { width, height } = jpegSize(jpeg);
    const page = 3 + i * 3;
    const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`;
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`,
    );
    object(
      page + 1,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>`,
      jpeg,
    );
    object(page + 2, `<< /Length ${content.length} >>`, new TextEncoder().encode(content));
    opts.onProgress?.(i + 1);
  }

  const xref = at;
  const size = offsets.length;
  add(`xref\n0 ${size}\n`);
  add("0000000000 65535 f \n");
  for (let n = 1; n < size; n++) add(`${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`);
  add(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(at);
  let cursor = 0;
  for (const part of parts) {
    if (typeof part === "string") {
      for (let i = 0; i < part.length; i++) out[cursor++] = part.charCodeAt(i);
    } else {
      out.set(part, cursor);
      cursor += part.byteLength;
    }
  }
  return out;
};
