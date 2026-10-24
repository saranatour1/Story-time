import { useQuery } from "@tanstack/react-query";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, useConvex, useMutation } from "convex/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileDownIcon,
  FileUpIcon,
  ImageDownIcon,
  Maximize2Icon,
  LockIcon,
  LockKeyholeIcon,
  PencilIcon,
  PencilRulerIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
  UnlockIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import { deletePhotos } from "@/lib/actions";
import { dayKey, viewerDay } from "@/lib/photo-groups";
import { uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { newId, placed, type NewThing } from "./add";
import { StickerCutter } from "./cutter";
import { LockedPdfDialog } from "./locked-pdf-dialog";
import { PageEditor, writable } from "./editor";
import { pathThrough, readDrawing, writeDrawing } from "./elements";
import type { Idea } from "./ideas";
import {
  download,
  fileName,
  journalFile,
  journalPdf,
  pagePng,
  readJournalFile,
  waitForPage,
  wholeJournalPdfLabel,
} from "./export";
import { PdfCancelled } from "./pdf-book";
import { DRAW_NAMES, DRAW_WIDTH, FONTS, GRAIN, INKS, paperLook } from "./look";
import { JournalMenu, type Layer } from "./menu";
import { contentsByDay } from "./contents";
import { JournalPage, type PageData } from "./page";
import { AddTray, Inspector } from "./panel";
import { Reader } from "./reader";
import { useJournal } from "./use-journal";

type PageId = Id<"journalPages">;

// What was copied or cut, for pasting on any page of any journal open here.
let clipboard: JournalElement | null = null;

// A picture's size, and whether it has see-through parts (then it is a
// sticker, not a photo).
const measure = async (file: File): Promise<{ w: number; h: number; clear: boolean }> => {
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  let clear = false;
  if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif") {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(bitmap, 0, 0, 48, 48);
    const data = ctx?.getImageData(0, 0, 48, 48).data;
    for (let i = 3; data && i < data.length; i += 4) {
      if (data[i]! < 230) {
        clear = true;
        break;
      }
    }
  }
  bitmap.close();
  return { w, h, clear };
};

const isUrl = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.closest("input, textarea, select") !== null);

// The journal of an experience: its pages down the side, the open page in the
// middle, and what to add (or what to do with the picked thing) on the right.
// Read turns it into a book; the menu prints it, saves it as a file, or brings
// one back.
export const JournalBook = ({ event, momentId }: { event: EventView; momentId?: string }) => {
  const [index, setIndex] = useState(0);
  const journal = useJournal(event._id, index);
  const convex = useConvex();
  const { data: moments } = useQuery(queries.moments.list({ eventId: event._id }));
  const stickers = useQuery(queries.journal.stickers({ eventId: event._id })).data ?? [];
  const momentById = useMemo(
    () => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])),
    [moments],
  );
  const photos = useMemo(
    () =>
      (moments ?? []).flatMap((m) =>
        [m.blocks, ...m.stops.map((s) => s.blocks)]
          .flat()
          .flatMap((b) => (b.type === "photo" ? [b.mediaId as string] : [])),
      ),
    [moments],
  );

  // The page wants the room: the app's sidebar folds to its icons while the
  // journal is open, and comes back after.
  const sidebar = useSidebar();
  const folded = useRef(false);
  useEffect(() => {
    if (sidebar.open && !sidebar.isMobile && window.innerWidth < 1700) {
      folded.current = true;
      sidebar.setOpen(false);
    }
    return () => {
      if (folded.current) sidebar.setOpen(true);
    };
    // Once, when the journal opens.
  }, []);

  // Asked for a moment's page: open on it once that page exists. An empty list
  // while the book is still loading is not "there is no page".
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !momentId || !journal.ready) return;
    const at = journal.pages.findIndex((p) => p.momentId === momentId);
    if (at >= 0) {
      opened.current = true;
      setIndex(at);
      return;
    }
    if (journal.pending === 0) opened.current = true;
  }, [momentId, journal.ready, journal.pages, journal.pending]);
  const [selected, setSelected] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  // Read or make: owners make by default, everyone else reads.
  const [mode, setMode] = useState<"read" | "make" | null>(null);
  const reading = mode === null ? !journal.owner : mode === "read" || !journal.owner;
  const setReading = (read: boolean) => setMode(read ? "read" : "make");
  const [cutting, setCutting] = useState<{ open: boolean; photo?: string }>({ open: false });
  const [removing, setRemoving] = useState<PageId | null>(null);
  // The panel as a sheet, on a phone.
  const [sheet, setSheet] = useState(false);
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null);
  const printJob = useRef<AbortController | null>(null);
  const [locking, setLocking] = useState(false);
  const [sheetPage, setSheetPage] = useState<PageData | null>(null);
  const importer = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // Where pictures picked from the device go: where the page was right-clicked, or the middle.
  const pickAt = useRef<{ x: number; y: number } | undefined>(undefined);
  const token = useAuthToken();
  const keepPicture = useMutation(api.journal.keepSticker);
  const dropSticker = useMutation(api.journal.dropSticker);
  const previewLink = useAction(api.journal.linkPreview);
  // The pen, when drawing: what draws and in which ink. Strokes drawn in one go
  // gather into one drawing (`session`) until the pen is put down.
  const [pen, setPen] = useState<{ style: string; color: string } | null>(null);
  const session = useRef<{ page: string; id: string } | null>(null);
  const putPenDown = () => {
    setPen(null);
    session.current = null;
  };

  const pages = journal.pages;
  const summary = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const page =
    journal.open && summary && journal.open._id === summary._id
      ? (journal.open as PageData)
      : undefined;
  const editable = journal.canEdit && page !== undefined && !page.locked && !reading;
  const chosen = page?.elements.find((e) => e.id === selected);

  // The middle column's size, for fitting the page into it.
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 900 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reading]);
  // The page fits the space; zoom multiplies that, from a fifth to three times A4.
  const fit = Math.max(0.15, Math.min((size.w - 32) / PAGE.w, (size.h - 32) / PAGE.h));
  const [zoom, setZoom] = useState(1);
  const scale = Math.min(3, Math.max(0.15, fit * zoom));
  // Where to keep still while zooming (a point in the stage, and the page point under it).
  const anchor = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const zoomBy = (factor: number, at?: { clientX: number; clientY: number }) => {
    const el = stage.current;
    if (el && at) {
      const r = el.getBoundingClientRect();
      const sx = at.clientX - r.left;
      const sy = at.clientY - r.top;
      anchor.current = {
        sx,
        sy,
        px: (el.scrollLeft + sx) / scale,
        py: (el.scrollTop + sy) / scale,
      };
    }
    setZoom((z) => Math.min(3 / fit, Math.max(0.15 / fit, z * factor)));
  };
  // After a zoom at a point, scroll so that point stays under the pointer.
  useLayoutEffect(() => {
    const el = stage.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = a.px * scale - a.sx;
    el.scrollTop = a.py * scale - a.sy;
  }, [scale]);
  // A pinch, or ⌘/Ctrl and the wheel, zooms the page and not the browser.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.01), e);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  // Holding Space turns the pointer into a hand that moves a zoomed-in page around.
  const [hand, setHand] = useState(false);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target) && !e.repeat) {
        e.preventDefault();
        setHand(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setHand(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    setSelected(null);
    setWriting(null);
    session.current = null;
  }, [index]);

  const change = useCallback(
    (elements: JournalElement[], paper?: string) => {
      if (page) journal.write(page._id as PageId, { elements, paper });
    },
    [journal, page],
  );
  const changeOne = (id: string, patch: Partial<JournalElement>) =>
    page && change(page.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const add = (thing: NewThing, at?: { x: number; y: number }) => {
    if (!page || !editable) return;
    const id = newId();
    const made = placed(thing, page.elements, id);
    change([
      ...page.elements,
      at ? { ...made, x: Math.round(at.x - made.w / 2), y: Math.round(at.y - made.h / 2) } : made,
    ]);
    setSelected(id);
  };
  const remove = (e = chosen) => {
    if (!page || !e) return;
    change(page.elements.filter((x) => x.id !== e.id));
    setSelected(null);
  };
  const duplicate = (e = chosen) => {
    if (!page || !e) return;
    const id = newId();
    change([
      ...page.elements,
      {
        ...e,
        id,
        x: e.x + 24,
        y: e.y + 24,
        z: Math.max(...page.elements.map((x) => x.z)) + 1,
        locked: undefined,
      },
    ]);
    setSelected(id);
  };
  // To the very front or back, or one step past its nearest neighbour.
  const layer = (e: JournalElement | undefined, to: Layer) => {
    if (!page || !e) return;
    const others = page.elements.filter((x) => x.id !== e.id).map((x) => x.z);
    if (others.length === 0) return;
    const above = others.filter((z) => z > e.z);
    const below = others.filter((z) => z < e.z);
    const z =
      to === "front"
        ? Math.max(...others) + 1
        : to === "back"
          ? Math.min(...others) - 1
          : to === "forward"
            ? above.length
              ? Math.min(...above) + 0.5
              : e.z
            : below.length
              ? Math.max(...below) - 0.5
              : e.z;
    changeOne(e.id, { z });
  };
  const restack = (to: "front" | "back") => layer(chosen, to);
  const copy = (e = chosen) => {
    if (e) clipboard = { ...e, locked: undefined };
  };
  const cut = (e = chosen) => {
    if (!e || e.locked) return;
    copy(e);
    remove(e);
  };
  // A copy of what was copied: at `at`, or a little off where it was.
  const pasteCopied = (at?: { x: number; y: number }) => {
    if (!page || !editable || !clipboard) return;
    const id = newId();
    const c = clipboard;
    const spot = at
      ? { x: Math.round(at.x - c.w / 2), y: Math.round(at.y - c.h / 2) }
      : { x: c.x + 24, y: c.y + 24 };
    change([
      ...page.elements,
      { ...c, id, ...spot, z: Math.max(0, ...page.elements.map((x) => x.z)) + 1 },
    ]);
    clipboard = { ...c, ...spot };
    setSelected(id);
  };

  // A stroke of the pen joins this session's drawing (growing its frame), or
  // starts one. A drawing someone moved or sized since is left as it is.
  const stroke = (points: Array<{ x: number; y: number }>) => {
    if (!page || !pen || points.length === 0) return;
    const pad = (DRAW_WIDTH[pen.style]?.width ?? 4) / 2 + 2;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const box = {
      x0: Math.min(...xs) - pad,
      y0: Math.min(...ys) - pad,
      x1: Math.max(...xs) + pad,
      y1: Math.max(...ys) + pad,
    };
    const line = { style: pen.style, color: pen.color, d: pathThrough(points) };
    const current =
      session.current?.page === page._id
        ? page.elements.find((e) => e.id === session.current?.id)
        : undefined;
    const data = current ? readDrawing(current.text) : undefined;
    const untouched =
      current &&
      data &&
      current.x === data.x &&
      current.y === data.y &&
      current.w === data.w &&
      current.h === data.h;
    if (current && data && untouched) {
      const x = Math.floor(Math.min(data.x, box.x0));
      const y = Math.floor(Math.min(data.y, box.y0));
      const w = Math.ceil(Math.max(data.x + data.w, box.x1)) - x;
      const h = Math.ceil(Math.max(data.y + data.h, box.y1)) - y;
      const text = writeDrawing({ x, y, w, h, strokes: [...data.strokes, line] });
      if (text.length < 38_000) {
        changeOne(current.id, { x, y, w, h, text });
        return;
      }
    }
    const x = Math.floor(box.x0);
    const y = Math.floor(box.y0);
    const w = Math.ceil(box.x1) - x;
    const h = Math.ceil(box.y1) - y;
    const id = newId();
    change([
      ...page.elements,
      {
        id,
        kind: "drawing",
        style: pen.style,
        color: pen.color,
        x,
        y,
        w,
        h,
        rotation: 0,
        z: Math.max(0, ...page.elements.map((e) => e.z)) + 1,
        text: writeDrawing({ x, y, w, h, strokes: [line] }),
      },
    ]);
    session.current = { page: page._id, id };
  };

  // Pictures from the device: each is saved with the journal and put on the
  // page as a photo, or as a sticker when it has see-through parts.
  const addPictures = async (files: File[], at?: { x: number; y: number }) => {
    const pictures = files.filter((f) => f.type.startsWith("image/")).slice(0, 12);
    if (!page || !editable || !token || pictures.length === 0) return;
    const toastId = toast.loading(
      pictures.length === 1 ? "Adding the picture…" : `Adding ${pictures.length} pictures…`,
    );
    let placedHere = at;
    try {
      for (const file of pictures) {
        const size = await measure(file);
        const mediaId = await uploadMedia(file, event._id, token);
        await keepPicture({ mediaId: mediaId as Id<"media"> });
        const w = size.clear ? 260 : 340;
        const h =
          Math.round((w * size.h) / Math.max(1, size.w)) + (size.clear ? 0 : Math.round(w * 0.12));
        add(
          size.clear
            ? { kind: "sticker", mediaId, w, h }
            : { kind: "photo", style: "polaroid", mediaId, w, h },
          placedHere,
        );
        // The next one lands a little further along.
        if (placedHere) placedHere = { x: placedHere.x + 30, y: placedHere.y + 30 };
      }
      toast.success(pictures.length === 1 ? "Picture added" : `${pictures.length} pictures added`, {
        id: toastId,
      });
    } catch (e) {
      toast.error(errorMessage(e), { id: toastId });
    }
  };

  // A link as a card, read from the page it points to.
  const addLink = async (url: string, at?: { x: number; y: number }) => {
    if (!page || !editable || !isUrl(url)) return;
    const toastId = toast.loading("Reading the link…");
    try {
      const preview = await previewLink({ eventId: event._id, url: url.trim() });
      add(
        {
          kind: "link",
          style: "card",
          text: JSON.stringify(preview),
          w: 300,
          h: preview.image ? 340 : 170,
        },
        at,
      );
      toast.success("Link added", { id: toastId });
    } catch (e) {
      toast.error(errorMessage(e), { id: toastId });
    }
  };

  // A ready-made page from the references, after this one.
  const addIdea = async (idea: Idea) => {
    if (!page || !journal.canEdit) return;
    const from = event.startsAt;
    const dates =
      from === undefined
        ? undefined
        : new Date(from).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const trip = { title: event.title, photos, dates };
    let id = await journal.addPage(page._id as PageId, idea.paper, idea.make(trip));
    for (const els of idea.more?.(trip) ?? []) {
      if (id === undefined) break;
      id = await journal.addPage(id, idea.paper, els);
    }
    if (id) setIndex(Math.min(index, pages.length - 1) + 1);
  };

  // Pasting: a picture or a link from anywhere, else what was copied here.
  useEffect(() => {
    const paste = (ev: ClipboardEvent) => {
      if (typing(ev.target) || reading || !editable) return;
      const files = [...(ev.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      const text = ev.clipboardData?.getData("text/plain") ?? "";
      if (files.length > 0) {
        ev.preventDefault();
        void addPictures(files);
      } else if (isUrl(text)) {
        ev.preventDefault();
        void addLink(text);
      } else if (clipboard) {
        ev.preventDefault();
        pasteCopied();
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  // What the last right-click was on, and where on the page.
  const [menu, setMenu] = useState<{ id?: string; at: { x: number; y: number } }>({
    at: { x: PAGE.w / 2, y: PAGE.h / 2 },
  });
  const menuOn = page?.elements.find((e) => e.id === menu.id);

  // The keys, while the journal is open and nobody is typing.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (typing(e.target) || reading) return;
      const mod = e.metaKey || e.ctrlKey;
      // Zoom, instead of the browser's.
      if (mod && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
        e.preventDefault();
        if (e.key === "0") setZoom(1);
        else zoomBy(e.key === "-" ? 0.8 : 1.25);
        return;
      }
      if (!journal.canEdit) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) journal.redo();
        else journal.undo();
      } else if (e.key === "Escape" && pen) {
        putPenDown();
      } else if (!editable || !chosen) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && e.key.toLowerCase() === "c") {
        copy();
      } else if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cut();
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if (e.key === "Enter" && writable(chosen)) {
        e.preventDefault();
        setWriting(chosen.id);
      } else if (e.key === "]" || e.key === "[") {
        restack(e.key === "]" ? "front" : "back");
      } else if (e.key.startsWith("Arrow") && !chosen.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        changeOne(chosen.id, { x: chosen.x + dx, y: chosen.y + dy });
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  // ---- Paper out ----------------------------------------------------------------

  const offstage = useRef<HTMLDivElement>(null);
  // Pages that share the open page's day. A page with no moment exports alone.
  const pagesForDay = (): PageId[] => {
    if (!summary) return [];
    const moment = summary.momentId ? momentById.get(summary.momentId) : undefined;
    if (!moment) return [summary._id as PageId];
    const key = dayKey(moment.startsAt, moment.tzOffsetMinutes);
    return pages.flatMap((p) => {
      const onDay = p.momentId ? momentById.get(p.momentId) : undefined;
      return onDay && dayKey(onDay.startsAt, onDay.tzOffsetMinutes) === key
        ? [p._id as PageId]
        : [];
    });
  };
  const drawPage = async (pageId: PageId) => {
    const loaded = await convex.query(api.journal.page, { pageId });
    if (!loaded) throw new Error("The page couldn't be drawn.");
    setSheetPage(loaded as PageData);
    const node = await waitForPage(() => offstage.current, loaded._id);
    return { node, hasMap: false, paper: paperLook(loaded.paper).color };
  };
  // Pages drawn one at a time offstage into one PDF, with the count shown.
  const makePdf = async (ids: PageId[]): Promise<Blob> => {
    const job = new AbortController();
    printJob.current = job;
    setPrinting({ done: 0, total: ids.length });
    try {
      return await journalPdf(
        ids.length,
        async (i) => {
          setPrinting({ done: i, total: ids.length });
          return drawPage(ids[i]!);
        },
        (n) => setPrinting({ done: n, total: ids.length }),
        job.signal,
      );
    } finally {
      if (printJob.current === job) printJob.current = null;
      setPrinting(null);
      setSheetPage(null);
    }
  };
  const printPdf = async (ids: PageId[], done: string) => {
    if (ids.length === 0) return;
    try {
      download(await makePdf(ids), `${fileName(event.title)}.pdf`);
      toast.success(done);
    } catch (e) {
      if (e instanceof PdfCancelled) return;
      toast.error(errorMessage(e));
    }
  };
  const printPage = async () => {
    if (!page) return;
    setPrinting({ done: 0, total: 1 });
    try {
      setSheetPage(page);
      const node = await waitForPage(() => offstage.current, page._id);
      download(
        await pagePng({ node, hasMap: false, paper: paperLook(page.paper).color }),
        `${fileName(event.title)}-page-${index + 1}.png`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPrinting(null);
      setSheetPage(null);
    }
  };
  const bringBack = async (file: File | undefined) => {
    if (!file) return;
    try {
      const list = await readJournalFile(file);
      if (list.length === 0) throw new Error("That file has no pages.");
      const n = await journal.importPages(list);
      toast.success(`Added ${n === 1 ? "a page" : `${n} pages`} at the end`);
      setIndex(pages.length);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ---- The page -------------------------------------------------------------------

  if (!journal.ready || moments === undefined) {
    return (
      <div className="grid h-[calc(100svh-12rem)] place-items-center text-stone-500">
        Opening the journal…
      </div>
    );
  }
  if (pages.length === 0) {
    return (
      <div
        className="paper-scope grid h-[calc(100svh-12rem)] place-items-center rounded-xl bg-[#e9dfcb] text-center text-[#1f1a16]"
        style={{ backgroundImage: GRAIN }}
      >
        <div className="space-y-2">
          <p style={{ fontFamily: FONTS.hand, fontSize: 34 }}>
            {journal.filling ? "Cutting and pasting your pages…" : "No journal yet"}
          </p>
          <p className="text-sm text-stone-600">
            {journal.owner
              ? "Every moment gets a page of its own."
              : "Its owner hasn't started the journal yet."}
          </p>
        </div>
      </div>
    );
  }

  if (!page || !summary) {
    return (
      <div className="grid h-[calc(100svh-12rem)] place-items-center text-stone-500">
        Turning the page…
      </div>
    );
  }
  const pageId = page._id as PageId;
  const removeSticker = async (id: string) => {
    try {
      await dropSticker({ mediaId: id as Id<"media"> });
      if (token) await deletePhotos([id], token);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const at = Math.min(index, pages.length - 1);

  // What to add, or what to do with the picked thing: the right column on a
  // wide screen, a sheet from the bottom on a phone.
  const panel = !editable ? (
    <p className="px-3 py-4 text-sm text-stone-600">
      {journal.locked
        ? "The journal is locked. Unlock it to change it."
        : page?.locked
          ? "This page is locked. Unlock it to change it."
          : "Only the experience's owner can change the journal."}
    </p>
  ) : chosen ? (
    <Inspector
      e={chosen}
      onChange={(patch) => changeOne(chosen.id, patch)}
      onWrite={() => setWriting(chosen.id)}
      onRestack={restack}
      onDuplicate={() => duplicate()}
      onDelete={() => remove()}
      onCut={() => setCutting({ open: true, photo: chosen.mediaId })}
    />
  ) : (
    <AddTray
      moments={moments}
      stickers={stickers}
      paper={page!.paper}
      onAdd={(thing) => {
        add(thing);
        setSheet(false);
      }}
      onPaper={(paper) => change(page!.elements, paper)}
      onCut={() => setCutting({ open: true })}
      onRemoveSticker={(id) => void removeSticker(id)}
      onIdea={(idea) => void addIdea(idea)}
      onUpload={() => {
        pickAt.current = undefined;
        picker.current?.click();
      }}
      onLink={(url) => addLink(url)}
      onDraw={() => setPen({ style: "pen", color: INKS[0].color })}
    />
  );

  return (
    <div
      className="paper-scope flex h-[calc(100svh-9.5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-stone-300 bg-[#e9dfcb] text-[#1f1a16]"
      style={{ backgroundImage: GRAIN }}
    >
      {/* The toolbar. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-300/80 bg-[#f3ead6]/90 px-2 py-1.5">
        <h2 className="mr-2 truncate text-2xl leading-none" style={{ fontFamily: FONTS.hand }}>
          {at === 0 ? "Cover" : `Page ${at}`}
        </h2>
        {journal.owner && (
          <div className="flex items-center rounded-lg bg-white/60 p-0.5">
            <Button
              size="sm"
              variant={reading ? "ghost" : "default"}
              onClick={() => setReading(false)}
            >
              <PencilRulerIcon aria-hidden /> Make
            </Button>
            <Button
              size="sm"
              variant={reading ? "default" : "ghost"}
              onClick={() => setReading(true)}
            >
              <BookOpenIcon aria-hidden /> Read
            </Button>
          </div>
        )}
        {!reading && journal.canEdit && (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Undo"
              title="Undo (⌘Z)"
              disabled={!journal.canUndo}
              onClick={journal.undo}
            >
              <Undo2Icon aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Redo"
              title="Redo (⇧⌘Z)"
              disabled={!journal.canRedo}
              onClick={journal.redo}
            >
              <Redo2Icon aria-hidden />
            </Button>
          </>
        )}
        {!reading && (
          <div className="flex items-center rounded-lg bg-white/60 p-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Zoom out"
              title="Zoom out (⌘−)"
              onClick={() => zoomBy(0.8)}
            >
              <ZoomOutIcon aria-hidden />
            </Button>
            <button
              type="button"
              title="Fit the page (⌘0)"
              onClick={() => setZoom(1)}
              className="w-12 rounded-md text-center font-mono text-xs tabular-nums hover:bg-white focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none"
            >
              {Math.round(scale * 100)}%
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Zoom in"
              title="Zoom in (⌘+)"
              onClick={() => zoomBy(1.25)}
            >
              <ZoomInIcon aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Fit the page"
              title="Fit the page (⌘0)"
              disabled={zoom === 1}
              onClick={() => setZoom(1)}
            >
              <Maximize2Icon aria-hidden />
            </Button>
          </div>
        )}
        {!reading && journal.canEdit && (
          <Button
            size="sm"
            variant={pen ? "default" : "outline"}
            aria-pressed={pen !== null}
            title={pen ? "Put the pen down (Esc)" : "Draw on the page"}
            disabled={!editable}
            onClick={() => (pen ? putPenDown() : setPen({ style: "pen", color: INKS[0].color }))}
          >
            <PencilIcon aria-hidden /> {pen ? "Drawing" : "Draw"}
          </Button>
        )}
        {pen && (
          <div className="flex items-center gap-1 rounded-lg bg-white/70 p-0.5" aria-label="Pen">
            {Object.keys(DRAW_WIDTH).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={pen.style === style ? "default" : "ghost"}
                onClick={() => setPen({ ...pen, style })}
              >
                {DRAW_NAMES[style]}
              </Button>
            ))}
            <span aria-hidden className="mx-0.5 h-5 w-px bg-stone-300" />
            {INKS.map((ink) => (
              <button
                key={ink.color}
                type="button"
                aria-label={`${ink.name} ink`}
                aria-pressed={pen.color === ink.color}
                title={ink.name}
                onClick={() => setPen({ ...pen, color: ink.color })}
                className={cn(
                  "size-6 rounded-full border shadow-sm focus-visible:ring-2 focus-visible:ring-[#c4552f] focus-visible:outline-none",
                  pen.color === ink.color
                    ? "ring-2 ring-[#c4552f] ring-offset-1"
                    : "border-stone-300",
                )}
                style={{ background: ink.color }}
              />
            ))}
          </div>
        )}
        {/* On a phone the page strip and the panel are folded away: arrows turn
            the pages, and the panel opens as a sheet. */}
        {!reading && (
          <div className="flex items-center gap-0.5 sm:hidden">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="The page before"
              disabled={at === 0}
              onClick={() => setIndex(at - 1)}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="The page after"
              disabled={at === pages.length - 1}
              onClick={() => setIndex(at + 1)}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        )}
        {!reading && journal.canEdit && (
          <Button size="sm" variant="outline" className="md:hidden" onClick={() => setSheet(true)}>
            {chosen ? <SlidersHorizontalIcon aria-hidden /> : <PlusIcon aria-hidden />}{" "}
            {chosen ? "Edit" : "Add"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {journal.owner && (
            <Button
              size="sm"
              variant={journal.locked ? "default" : "ghost"}
              title={
                journal.locked ? "Unlock the journal" : "Lock the whole journal, so nothing moves"
              }
              onClick={() => void journal.lockJournal(!journal.locked)}
            >
              {journal.locked ? <LockIcon aria-hidden /> : <UnlockIcon aria-hidden />}{" "}
              {journal.locked ? "Locked" : "Lock"}
            </Button>
          )}
          {printing && printJob.current && (
            <Button size="sm" variant="ghost" onClick={() => printJob.current?.abort()}>
              Cancel
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={printing !== null}>
                <DownloadIcon aria-hidden />{" "}
                {printing ? `Printing ${printing.done}/${printing.total}…` : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              <DropdownMenuItem
                data-track="journal_exported"
                data-format="pdf_page"
                onSelect={() => void printPdf([pageId], "This page is ready")}
              >
                <FileDownIcon /> This page as a PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                data-track="journal_exported"
                data-format="pdf_day"
                onSelect={() => void printPdf(pagesForDay(), "This day is ready")}
              >
                <FileDownIcon /> This day as a PDF ({pagesForDay().length}{" "}
                {pagesForDay().length === 1 ? "page" : "pages"})
              </DropdownMenuItem>
              <DropdownMenuItem
                data-track="journal_exported"
                data-format="pdf_journal"
                onSelect={() =>
                  void printPdf(
                    pages.map((p) => p._id as PageId),
                    "Your journal is ready",
                  )
                }
              >
                <FileDownIcon /> {wholeJournalPdfLabel(pages.length)}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-track="journal_exported"
                data-format="picture"
                onSelect={() => void printPage()}
              >
                <ImageDownIcon /> This page as a picture
              </DropdownMenuItem>
              {journal.canEdit && (
                <DropdownMenuItem
                  data-track="journal_exported"
                  data-format="locked_pdf"
                  onSelect={() => setLocking(true)}
                >
                  <LockKeyholeIcon /> Share as a locked PDF…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-track="journal_exported"
                data-format="journal_file"
                onSelect={() =>
                  void convex.query(api.journal.get, { eventId: event._id }).then(
                    (book) =>
                      download(
                        journalFile(event.title, book.pages),
                        `${fileName(event.title)}.journal.json`,
                      ),
                    (e: unknown) => toast.error(errorMessage(e)),
                  )
                }
              >
                <DownloadIcon /> Save a journal file
              </DropdownMenuItem>
              {journal.canEdit && (
                <DropdownMenuItem onSelect={() => importer.current?.click()}>
                  <FileUpIcon /> Add pages from a journal file
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void addPictures([...(e.target.files ?? [])], pickAt.current);
              e.target.value = "";
            }}
          />
          <input
            ref={importer}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void bringBack(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Contents, by day. The open page and its neighbours are drawn small;
            the rest stay a label, so the strip does not decode every photo. */}
        <nav
          aria-label="Pages"
          className="hidden w-32 shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-300/80 bg-[#efe6d2]/80 p-2 sm:flex"
        >
          {contentsByDay(pages, momentById, viewerDay()).map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="sticky top-0 z-10 bg-[#efe6d2]/95 py-0.5 font-mono text-[10px] tracking-[0.12em] text-stone-500 uppercase">
                {group.label}
                {group.today && (
                  <span className="ml-1 font-sans normal-case tracking-normal text-[#c4552f]">
                    Today
                  </span>
                )}
              </h2>
              {group.pages.map(({ index: i }) => {
                const p = pages[i]!;
                const name = p.label || (i === 0 ? "Cover" : `Page ${i}`);
                return (
                  <div key={p._id}>
                    <button
                      type="button"
                      aria-label={`${group.label}, ${name}`}
                      aria-current={i === at ? "page" : undefined}
                      onClick={() => setIndex(i)}
                      className={cn(
                        "block overflow-hidden rounded-sm shadow-sm ring-offset-2 ring-offset-[#efe6d2] transition hover:-translate-y-0.5",
                        i === at ? "ring-2 ring-[#c4552f]" : "ring-1 ring-stone-300",
                      )}
                    >
                      <StripFace
                        pageId={p._id}
                        paper={p.paper}
                        label={name}
                        draw={Math.abs(i - at) <= 1}
                        moments={momentById}
                      />
                    </button>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-stone-600">
                      <span style={{ fontFamily: FONTS.typewriter }}>{i === 0 ? "cover" : i}</span>
                      {p.locked && <LockIcon aria-label="Locked" className="size-3" />}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
          {journal.canEdit && !reading && (
            <Button
              size="sm"
              variant="outline"
              className="border-dashed"
              onClick={() => void journal.addPage(pageId).then((id) => id && setIndex(at + 1))}
            >
              <PlusIcon aria-hidden /> Page
            </Button>
          )}
        </nav>

        {/* The open page, or the book. */}
        <div
          ref={stage}
          className={cn(
            "relative min-w-0 flex-1 overflow-auto",
            hand && "cursor-grab active:cursor-grabbing",
          )}
          onPointerDownCapture={(e) => {
            if (!hand || !stage.current) return;
            // The hand moves the page; nothing on it is picked up.
            e.stopPropagation();
            e.preventDefault();
            panning.current = {
              x: e.clientX,
              y: e.clientY,
              left: stage.current.scrollLeft,
              top: stage.current.scrollTop,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const p = panning.current;
            if (!p || !stage.current) return;
            stage.current.scrollLeft = p.left - (e.clientX - p.x);
            stage.current.scrollTop = p.top - (e.clientY - p.y);
          }}
          onPointerUp={() => (panning.current = null)}
          onPointerCancel={() => (panning.current = null)}
          // Pictures dropped on the page land where they were let go.
          onDragOver={(e) => {
            if (editable && e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files];
            if (!editable || files.length === 0) return;
            e.preventDefault();
            const r = stage.current
              ?.querySelector<HTMLElement>("[data-journal-page]")
              ?.getBoundingClientRect();
            void addPictures(
              files,
              r ? { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale } : undefined,
            );
          }}
        >
          {reading ? (
            <Reader pages={pages} moments={momentById} size={size} start={at} onPage={setIndex} />
          ) : (
            // Centred while it fits; scrollable to every edge once it doesn't.
            <div className="flex min-h-full min-w-max p-4">
              <div className="m-auto">
                {summary?.gone && (
                  <p
                    className="mb-3 max-w-md text-center text-stone-700"
                    style={{ fontFamily: FONTS.hand, fontSize: 22 }}
                  >
                    This moment was taken out of the trip.{" "}
                    {journal.canEdit && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setRemoving(pageId)}
                      >
                        Take this page out
                      </button>
                    )}
                  </p>
                )}
                {summary?.stale && summary.edited && !summary.gone && journal.canEdit && (
                  <p
                    className="mb-3 max-w-md text-center text-stone-700"
                    style={{ fontFamily: FONTS.hand, fontSize: 22 }}
                  >
                    The moment changed.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void journal.refreshPage(summary._id as PageId)}
                    >
                      Update this page
                    </button>
                  </p>
                )}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className="shadow-[0_18px_40px_rgba(40,28,10,.32)]"
                      onContextMenu={(ev) => {
                        // What is under the pointer, and where on the page.
                        const root =
                          ev.currentTarget.querySelector<HTMLElement>("[data-journal-page]");
                        const r = root?.getBoundingClientRect();
                        const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-el]")
                          ?.dataset.el;
                        setMenu({
                          id,
                          at: r
                            ? { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }
                            : { x: PAGE.w / 2, y: PAGE.h / 2 },
                        });
                        setWriting(null);
                        if (id && editable) setSelected(id);
                      }}
                    >
                      <PageEditor
                        page={page!}
                        moments={momentById}
                        scale={scale}
                        editable={editable}
                        selected={selected}
                        writing={writing}
                        onSelect={setSelected}
                        onWrite={setWriting}
                        onChange={(els) => change(els)}
                        pen={pen}
                        onStroke={stroke}
                      />
                    </div>
                  </ContextMenuTrigger>
                  <JournalMenu
                    e={menuOn}
                    paper={page!.paper}
                    pageLocked={page!.locked || journal.locked}
                    can={{
                      paste: clipboard !== null && editable,
                      edit: journal.owner && !journal.locked,
                    }}
                    act={{
                      write: (e) => setWriting(e.id),
                      copy,
                      cut,
                      paste: () => pasteCopied(menuOn ? undefined : menu.at),
                      draw: () => setPen({ style: "pen", color: INKS[0].color }),
                      picture: () => {
                        pickAt.current = menu.at;
                        picker.current?.click();
                      },
                      link: () => {
                        const url = window.prompt("The link to put on the page");
                        if (url) void addLink(url, menu.at);
                      },
                      duplicate,
                      layer,
                      change: (e, patch) => changeOne(e.id, patch),
                      sticker: (e) => setCutting({ open: true, photo: e.mediaId }),
                      remove,
                      addHere: (thing) => add(thing, menu.at),
                      paper: (paper) => change(page!.elements, paper),
                      addPage: () =>
                        void journal.addPage(pageId).then((id) => id && setIndex(at + 1)),
                      lockPage: () => void journal.lockPage(pageId, !page!.locked),
                      savePicture: () => void printPage(),
                      read: () => setReading(true),
                    }}
                  />
                </ContextMenu>
              </div>
            </div>
          )}
        </div>

        {/* What to add, or what to do with the picked thing. */}
        {!reading && (
          <aside
            aria-label={chosen ? "The picked thing" : "Things to add"}
            className="hidden w-64 shrink-0 xl:w-72 overflow-y-auto border-l border-stone-300/80 bg-[#f3ead6]/90 md:block"
          >
            {journal.canEdit && page && (
              <div className="flex flex-wrap items-center gap-1 border-b border-stone-300/70 px-3 py-2">
                <span className="mr-auto font-mono text-[11px] tracking-[0.14em] text-stone-500 uppercase">
                  This page
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move it earlier"
                  disabled={at === 0}
                  onClick={() =>
                    void journal
                      .movePage(pageId, pages[at - 1]!._id as PageId)
                      .then(() => setIndex(at - 1))
                  }
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move it later"
                  disabled={at === pages.length - 1}
                  onClick={() =>
                    void journal
                      .movePage(pageId, (pages[at + 2]?._id as PageId | undefined) ?? null)
                      .then(() => setIndex(at + 1))
                  }
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant={page.locked ? "default" : "ghost"}
                  aria-label={page.locked ? "Unlock this page" : "Lock this page"}
                  title={page.locked ? "Unlock this page" : "Lock this page"}
                  onClick={() => void journal.lockPage(pageId, !page.locked)}
                >
                  {page.locked ? <LockIcon aria-hidden /> : <UnlockIcon aria-hidden />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Take this page out"
                  className="text-destructive"
                  disabled={page.locked}
                  onClick={() => setRemoving(pageId)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
            )}
            {panel}
          </aside>
        )}
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent
          side="bottom"
          className="paper-scope max-h-[75svh] overflow-y-auto bg-[#f3ead6] p-0 text-[#1f1a16]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle style={{ fontFamily: FONTS.hand, fontSize: 26, fontWeight: 400 }}>
              {chosen ? "The picked thing" : "Add to the page"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {chosen ? "Change or remove what is picked." : "Things to put on this page."}
            </SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
      <LockedPdfDialog
        event={event}
        pages={pages.length}
        open={locking}
        onOpenChange={setLocking}
        print={() => makePdf(pages.map((p) => p._id as PageId))}
      />
      <StickerCutter
        eventId={event._id}
        photos={photos}
        start={cutting.photo}
        open={cutting.open}
        onOpenChange={(open) => setCutting((c) => ({ ...c, open }))}
        onMade={(mediaId) => add({ kind: "sticker", mediaId, w: 0, h: 0 })}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Take this page out?"
        description="Everything on it goes with it. Its moment stays in the experience."
        confirmLabel="Take it out"
        onConfirm={async () => {
          if (removing) await journal.removePage(removing);
          setIndex(Math.max(0, at - 1));
          setRemoving(null);
        }}
      />
      {/* Pages drawn at full size, out of sight, for printing. */}
      {sheetPage !== null &&
        createPortal(
          <div
            ref={offstage}
            aria-hidden
            className="pointer-events-none fixed top-0 -left-[3000px]"
          >
            <JournalPage
              page={sheetPage}
              moments={momentById}
              scale={1}
              print
              pageKey={sheetPage._id}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

const THUMB = 96 / PAGE.w;

// The open page and the one on either side are drawn. Every other contents
// entry stays the paper colour and its label.
const StripFace = ({
  pageId,
  paper,
  label,
  draw,
  moments,
}: {
  pageId: string;
  paper: string;
  label: string;
  draw: boolean;
  moments: ReadonlyMap<string, MomentView>;
}) => {
  const { data: loaded } = useQuery(
    queries.journal.page(draw ? { pageId: pageId as PageId } : "skip"),
  );
  if (draw && loaded)
    return <JournalPage page={loaded} moments={moments} scale={THUMB} live={false} />;
  return (
    <span
      className="block overflow-hidden px-1.5 py-2 text-left text-[11px] leading-snug text-stone-700"
      style={{
        background: paperLook(paper).color,
        fontFamily: FONTS.hand,
        width: PAGE.w * THUMB,
        height: PAGE.h * THUMB,
      }}
    >
      {label}
    </span>
  );
};
