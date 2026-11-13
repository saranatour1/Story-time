import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import { assembleJournalPdf, PDF_QUALITY, PDF_SCALE, reuseCanvas } from "./pdf-book";

const settled = async (node: HTMLElement) => {
  const until = Date.now() + 10_000;
  while (Date.now() < until && node.querySelector(".animate-pulse"))
    await new Promise((r) => setTimeout(r, 150));
  await Promise.all(
    [...node.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)),
  );
  await document.fonts.ready;
};

const frame = {
  width: PAGE.w,
  height: PAGE.h,
  style: { transform: "none" },
  filter: (n: Node) => !(n instanceof HTMLElement && n.dataset.exportHide !== undefined),
};

export type Drawn = { node: HTMLElement; paper: string };

const afterNextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export const waitForPage = (
  root: () => HTMLElement | null,
  pageId: string,
): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    let frames = 0;
    const tick = () => {
      const node = root()?.querySelector<HTMLElement>("[data-journal-page]");
      if (node?.dataset.pageId === pageId) {
        resolve(afterNextPaint().then(() => node));
        return;
      }
      if (++frames > 60) reject(new Error("The page couldn't be drawn."));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

export const pagePng = async ({ node, paper }: Drawn): Promise<string> => {
  const { domToPng } = await import("modern-screenshot");
  await settled(node);
  return domToPng(node, { ...frame, scale: 2, backgroundColor: paper });
};

const pageJpeg = async (
  node: HTMLElement,
  paper: string,
  previousCanvas: HTMLCanvasElement | null,
): Promise<{ jpeg: Uint8Array; canvas: HTMLCanvasElement }> => {
  const { domToCanvas } = await import("modern-screenshot");
  const shot = await domToCanvas(node, { ...frame, scale: PDF_SCALE, backgroundColor: paper });
  const reused = reuseCanvas(previousCanvas, shot.width, shot.height, (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  const pageCanvas = reused.current;
  const context = pageCanvas.getContext("2d");
  if (!context) throw new Error("The page couldn't be drawn.");
  context.drawImage(shot, 0, 0);
  shot.width = 0;
  shot.height = 0;
  const blob = await new Promise<Blob | null>((resolve) =>
    pageCanvas.toBlob(resolve, "image/jpeg", PDF_QUALITY),
  );
  if (!blob) throw new Error("The page couldn't be drawn.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), canvas: pageCanvas };
};

export const journalPdf = async (
  count: number,
  draw: (index: number) => Promise<Drawn>,
  onProgress: (done: number) => void,
  signal?: AbortSignal,
): Promise<Blob> => {
  let pageCanvas: HTMLCanvasElement | null = null;
  const bytes = await assembleJournalPdf(
    count,
    async (index) => {
      const { node, paper } = await draw(index);
      await settled(node);
      const page = await pageJpeg(node, paper, pageCanvas);
      pageCanvas = page.canvas;
      return page.jpeg;
    },
    { signal, onProgress },
  );
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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

export const fileName = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "journal";

export const wholeJournalPdfLabel = (pages: number): string => {
  const count = `${pages} ${pages === 1 ? "page" : "pages"}`;
  return pages > 36
    ? `The whole journal as a PDF (${count}, a long one)`
    : `The whole journal as a PDF (${count})`;
};

const KIND = "story-time-journal";

type JournalFile = {
  kind: typeof KIND;
  version: 1;
  title: string;
  pages: Array<{ paper: string; elements: JournalElement[] }>;
};

export const journalFile = (
  title: string,
  pages: Array<{ paper: string; elements: JournalElement[] }>,
): Blob => {
  const file: JournalFile = {
    kind: KIND,
    version: 1,
    title,
    pages: pages.map(({ paper, elements }) => ({ paper, elements })),
  };
  return new Blob([JSON.stringify(file, null, 1)], { type: "application/json" });
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export const readJournalFile = async (
  file: File,
): Promise<Array<{ paper: string; elements: JournalElement[] }>> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That isn't a journal file.");
  }
  if (!isObject(parsed) || parsed.kind !== KIND || !Array.isArray(parsed.pages))
    throw new Error("That isn't a journal file.");
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
