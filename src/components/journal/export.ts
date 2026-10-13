import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import { assembleJournalPdf, PDF_QUALITY, PDF_SCALE, reuseCanvas } from "./pdf-book";

// Getting a journal out as paper (an A4 PDF, a page as a picture) and as a
// file it can come back from.

// Waits for a drawn page to have its photos and maps: placeholders still
// pulsing mean a photo is on its way. Gives up after a while and takes it as is.
const settled = async (node: HTMLElement, hasMap: boolean) => {
  const until = Date.now() + 10_000;
  while (Date.now() < until && node.querySelector(".animate-pulse")) await new Promise((r) => setTimeout(r, 150));
  await Promise.all([...node.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  await document.fonts.ready;
  // Map tiles come in after the map itself.
  if (hasMap) await new Promise((r) => setTimeout(r, 1800));
};

const frame = {
  width: PAGE.w,
  height: PAGE.h,
  // The page is drawn scaled on screen; the picture is at full size.
  style: { transform: "none" },
  // The play buttons on maps are for the screen, not the paper.
  filter: (n: Node) => !(n instanceof HTMLElement && n.dataset.exportHide !== undefined),
};

// A drawn page and what it needs: whether it has a map (to wait for tiles),
// and its paper's colour (the picture starts from it, under the paper's grain).
export type Drawn = { node: HTMLElement; hasMap: boolean; paper: string };

// Waits until React has committed the page being printed, then two frames so
// the picture is of that page and not the one before it.
// `root` is asked again each frame: the offstage sheet only exists once React
// has rendered the page being printed.
export const waitForPage = (root: () => HTMLElement | null, pageId: string): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    let frames = 0;
    const tick = () => {
      const node = root()?.querySelector<HTMLElement>("[data-journal-page]");
      if (node?.dataset.pageId === pageId) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(node)));
        return;
      }
      if (++frames > 60) reject(new Error("The page couldn't be drawn."));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

export const pagePng = async ({ node, hasMap, paper }: Drawn): Promise<string> => {
  const { domToPng } = await import("modern-screenshot");
  await settled(node, hasMap);
  return domToPng(node, { ...frame, scale: 2, backgroundColor: paper });
};

// Every page, one A4 sheet each, in order. `pages` draws them one at a time
// at full size and hands back the drawn node.
// One canvas for the whole book. Each page is drawn into it, encoded, and the
// screenshot's own canvas is dropped before the next page.
let pageCanvas: HTMLCanvasElement | null = null;

const pageJpeg = async (node: HTMLElement, paper: string): Promise<Uint8Array> => {
  const { domToCanvas } = await import("modern-screenshot");
  const shot = await domToCanvas(node, { ...frame, scale: PDF_SCALE, backgroundColor: paper });
  const reused = reuseCanvas(pageCanvas, shot.width, shot.height, (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  pageCanvas = reused.current;
  const context = pageCanvas.getContext("2d");
  if (!context) throw new Error("The page couldn't be drawn.");
  context.drawImage(shot, 0, 0);
  shot.width = 0;
  shot.height = 0;
  const blob = await new Promise<Blob | null>((resolve) => pageCanvas?.toBlob(resolve, "image/jpeg", PDF_QUALITY));
  if (!blob) throw new Error("The page couldn't be drawn.");
  return new Uint8Array(await blob.arrayBuffer());
};

export const journalPdf = async (
  count: number,
  draw: (index: number) => Promise<Drawn>,
  onProgress: (done: number) => void,
  signal?: AbortSignal,
): Promise<Blob> => {
  const bytes = await assembleJournalPdf(
    count,
    async (index) => {
      const { node, hasMap, paper } = await draw(index);
      await settled(node, hasMap);
      return pageJpeg(node, paper);
    },
    { signal, onProgress },
  );
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: "application/pdf" });
};

export const download = (href: string | Blob, name: string) => {
  const url = typeof href === "string" ? href : URL.createObjectURL(href);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  if (typeof href !== "string") setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const fileName = (title: string) => title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "journal";

// The sitting (this page, this day) is the ordinary print. Past a few dozen
// pages, the whole journal is the unusual one, and the menu says so.
export const wholeJournalPdfLabel = (pages: number): string => {
  const count = `${pages} ${pages === 1 ? "page" : "pages"}`;
  return pages > 36 ? `The whole journal as a PDF (${count}, a long one)` : `The whole journal as a PDF (${count})`;
};

// ---- The journal as a file ----------------------------------------------------------------

const KIND = "story-time-journal";

type JournalFile = { kind: typeof KIND; version: 1; title: string; pages: Array<{ paper: string; elements: JournalElement[] }> };

export const journalFile = (title: string, pages: Array<{ paper: string; elements: JournalElement[] }>): Blob => {
  const file: JournalFile = { kind: KIND, version: 1, title, pages: pages.map(({ paper, elements }) => ({ paper, elements })) };
  return new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// Reads a journal file back. Only its shape is checked here; the server
// checks every page as it adds it.
export const readJournalFile = async (file: File): Promise<Array<{ paper: string; elements: JournalElement[] }>> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That isn't a journal file.");
  }
  if (!isObject(parsed) || parsed.kind !== KIND || !Array.isArray(parsed.pages)) throw new Error("That isn't a journal file.");
  return parsed.pages.flatMap((p): Array<{ paper: string; elements: JournalElement[] }> => {
    if (!isObject(p) || typeof p.paper !== "string" || !Array.isArray(p.elements)) return [];
    const elements = p.elements.filter(
      (e): e is JournalElement =>
        isObject(e) &&
        typeof e.id === "string" &&
        typeof e.kind === "string" &&
        ["x", "y", "w", "h", "rotation", "z"].every((k) => typeof e[k] === "number"),
    );
    return [{ paper: p.paper, elements }];
  });
};
