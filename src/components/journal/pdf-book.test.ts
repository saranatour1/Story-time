import { describe, expect, test } from "vitest";
import { assembleJournalPdf, jpegSize, PdfCancelled, PDF_QUALITY, PDF_SCALE, reuseCanvas } from "./pdf-book";

function tinyJpeg(width: number, height: number, tag: number): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x03, tag, ...sof, 0xff, 0xd9]);
}

describe("a journal PDF", () => {
  test("prints below the old scale and quality", () => {
    expect(PDF_SCALE).toBe(1.5);
    expect(PDF_QUALITY).toBe(0.75);
    expect(PDF_SCALE).toBeLessThan(2);
    expect(PDF_QUALITY).toBeLessThan(0.9);
  });

  test("reads a JPEG's pixel size", () => {
    expect(jpegSize(tinyJpeg(1191, 1685, 1))).toEqual({ width: 1191, height: 1685 });
  });

  test("one canvas is reused while the pages are the same size", () => {
    let made = 0;
    let current: { width: number; height: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const next: { current: { width: number; height: number }; created: boolean } = reuseCanvas(
        current,
        1191,
        1685,
        (width, height) => {
          made += 1;
          return { width, height };
        },
      );
      current = next.current;
    }
    expect(made).toBe(1);
    const changed = reuseCanvas(current, 800, 600, (width, height) => {
      made += 1;
      return { width, height };
    });
    expect(changed.created).toBe(true);
    expect(made).toBe(2);
  });

  test("a book is one PDF, built a page at a time, and cancel stops the rest", async () => {
    const seen: number[] = [];
    const pdf = await assembleJournalPdf(3, async (index) => {
      seen.push(index);
      return tinyJpeg(8, 8, index + 1);
    }, { onProgress: (done) => expect(done).toBe(seen.length) });
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 3");
    expect(text).toContain("%%EOF");
    expect(seen).toEqual([0, 1, 2]);

    const signal = new AbortController();
    const progress: number[] = [];
    const printing = assembleJournalPdf(5, async (index) => {
      if (index === 1) signal.abort();
      return tinyJpeg(4, 4, index + 1);
    }, { signal: signal.signal, onProgress: (done) => progress.push(done) });
    await expect(printing).rejects.toBeInstanceOf(PdfCancelled);
    expect(progress).toEqual([1]);
  });
});
