import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { LoaderCircleIcon, ScissorsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { uploadMedia } from "@/lib/upload";
import { useMediaUrl, useWhenSeen } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";
import { FONTS } from "./look";

// Cutting a sticker out of a photo: tap the thing you want and it is cut free
// of its background, on this device. Google's MediaPipe model does the
// cutting; it is downloaded once, and the photo never leaves the browser until
// the finished sticker is saved like any other photo.

const MODEL = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
// The longest side of a sticker, in pixels: plenty for a page, small to save.
const MAX_SIDE = 900;

type Segmenter = import("@mediapipe/tasks-vision").InteractiveSegmenterLegacy;
let loading: Promise<Segmenter> | null = null;

const segmenter = (): Promise<Segmenter> => {
  loading ??= (async () => {
    const [{ InteractiveSegmenterLegacy }, loader, binary] = await Promise.all([
      import("@mediapipe/tasks-vision"),
      import("@mediapipe/tasks-vision/vision_wasm_internal.js?url"),
      import("@mediapipe/tasks-vision/vision_wasm_internal.wasm?url"),
    ]);
    return InteractiveSegmenterLegacy.createFromOptions(
      { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default },
      { baseOptions: { modelAssetPath: MODEL }, outputConfidenceMasks: true, outputCategoryMask: false },
    );
  })().catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
};

// The picked thing as a transparent PNG, cropped to it, its edge softened.
const cutOut = (img: HTMLImageElement, mask: Float32Array, mw: number, mh: number): Promise<Blob> => {
  const ratio = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mask[Math.floor((y / h) * mh) * mw + Math.floor((x / w) * mw)] ?? 0;
      // A soft ramp, so the edge isn't jagged.
      const a = Math.max(0, Math.min(1, (m - 0.35) / 0.3));
      pixels.data[(y * w + x) * 4 + 3] = Math.round(a * 255);
      if (a > 0.1) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return Promise.reject(new Error("Nothing was picked there. Try tapping the middle of it."));
  ctx.putImageData(pixels, 0, 0);
  const pad = 6;
  const crop = document.createElement("canvas");
  crop.width = x1 - x0 + pad * 2;
  crop.height = y1 - y0 + pad * 2;
  crop.getContext("2d")!.drawImage(canvas, x0 - pad, y0 - pad, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return new Promise((resolve, reject) => crop.toBlob((b) => (b ? resolve(b) : reject(new Error("The sticker couldn't be made."))), "image/png"));
};

export const StickerCutter = ({
  eventId,
  photos,
  start,
  open,
  onOpenChange,
  onMade,
}: {
  eventId: Id<"events">;
  photos: string[];
  // The photo to start on, if one was picked.
  start?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMade: (mediaId: string) => void;
}) => {
  const [photo, setPhoto] = useState<string | undefined>(start);
  const [point, setPoint] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    if (open) {
      setPhoto(start ?? photos[0]);
      setPoint({ x: 0.5, y: 0.5 });
    }
  }, [open, start, photos]);
  const { url } = useMediaUrl(photo);
  const img = useRef<HTMLImageElement>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "cutting" | "saving">("idle");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const token = useAuthToken();
  const keep = useMutation(api.journal.keepSticker);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  // Starts the model download as soon as the cutter opens.
  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    segmenter()
      .then(() => setPhase("idle"))
      .catch((e: unknown) => {
        setPhase("idle");
        toast.error(`The cutter couldn't load: ${errorMessage(e)}`);
      });
  }, [open]);

  const cutAt = async (at: { x: number; y: number }) => {
    const el = img.current;
    if (!el || phase !== "idle") return;
    setPhase("cutting");
    try {
      const seg = await segmenter();
      const blob = await new Promise<Blob>((resolve, reject) => {
        seg.segment(el, { keypoint: at }, (result) => {
          const masks = result.confidenceMasks ?? [];
          // The mask that is sure of the tapped spot is the thing; the other is the rest.
          const pick = masks
            .map((m) => ({ m, data: m.getAsFloat32Array() }))
            .sort((a, b) => valueAt(b.data, b.m.width, b.m.height, at) - valueAt(a.data, a.m.width, a.m.height, at))[0];
          if (!pick) return reject(new Error("Nothing was picked there."));
          cutOut(el, pick.data, pick.m.width, pick.m.height).then(resolve, reject);
        });
      });
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPhase("idle");
    }
  };

  const tap = (ev: React.PointerEvent<HTMLImageElement>) => {
    const el = img.current;
    if (!el || phase !== "idle") return;
    const r = el.getBoundingClientRect();
    const at = { x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) };
    setPoint(at);
    void cutAt(at);
  };

  const nudge = (ev: React.KeyboardEvent<HTMLImageElement>) => {
    const step = ev.shiftKey ? 0.08 : 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const dir = move[ev.key];
    if (dir) {
      ev.preventDefault();
      setPoint((p) => ({ x: clamp(p.x + dir[0]), y: clamp(p.y + dir[1]) }));
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      void cutAt(point);
    }
  };

  const save = async () => {
    if (!preview || !token) return;
    setPhase("saving");
    try {
      const mediaId = await uploadMedia(new File([preview.blob], "sticker.png", { type: "image/png" }), eventId, token);
      await keep({ mediaId: mediaId as Id<"media"> });
      onMade(mediaId);
      setPreview(null);
      onOpenChange(false);
      toast.success("Sticker made");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPhase("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper-scope max-w-2xl bg-[#f6efe0] text-[#1f1a16]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: FONTS.hand, fontSize: 30, fontWeight: 400 }}>Cut out a sticker</DialogTitle>
          <DialogDescription>
            Tap the thing you want to keep, or move the point with the arrow keys and press Enter. The scissors are a large download the first time, about 13 MB. The photo stays on this device until you keep the sticker.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="relative grid min-h-64 place-items-center overflow-hidden rounded-lg bg-[#e6dcc6]">
            {url ? (
              <span className="relative inline-grid">
                <img
                  ref={img}
                  src={url}
                  alt="Photo to cut. Arrow keys move the point, Enter cuts there."
                  decoding="async"
                  tabIndex={0}
                  onPointerDown={tap}
                  onKeyDown={nudge}
                  className={cn("max-h-[50vh] w-auto cursor-crosshair select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c4552f]", phase !== "idle" && "opacity-60")}
                  draggable={false}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#c4552f] bg-white/40"
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                />
              </span>
            ) : (
              <span className="animate-pulse text-sm text-stone-500">Loading the photo…</span>
            )}
            {phase !== "idle" && phase !== "saving" && (
              <span className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#1f1a16] px-3 py-1 text-xs text-[#f3ead6]">
                <LoaderCircleIcon className="size-3.5 animate-spin" /> {phase === "loading" ? "Getting the scissors…" : "Cutting…"}
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div
              className="grid aspect-square place-items-center rounded-lg border border-dashed border-stone-400 p-2"
              style={{ backgroundImage: "repeating-conic-gradient(#ece3cf 0 25%, #f6efe0 0 50%)", backgroundSize: "16px 16px" }}
            >
              {preview ? (
                <img
                  src={preview.url}
                  alt="The sticker"
                  className="max-h-full max-w-full"
                  style={{ filter: "drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff)" }}
                />
              ) : (
                <ScissorsIcon className="size-8 text-stone-400" aria-hidden />
              )}
            </div>
            <Button className="w-full" disabled={!preview || phase === "saving"} onClick={() => void save()}>
              {phase === "saving" ? "Saving…" : "Keep this sticker"}
            </Button>
          </div>
        </div>
        {photos.length > 1 && (
          <ul aria-label="Photos to cut from" className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((id) => (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  aria-label="Cut from this photo"
                  aria-pressed={photo === id}
                  onClick={() => {
                    setPhoto(id);
                    setPreview(null);
                  }}
                  className={cn("block size-14 overflow-hidden rounded-md border-2", photo === id ? "border-[#c4552f]" : "border-transparent")}
                >
                  <ThumbOf id={id} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ThumbOf = ({ id }: { id: string }) => {
  const [ref, seen] = useWhenSeen();
  const { url } = useMediaUrl(seen ? id : undefined, "thumb");
  return (
    <span ref={ref} className={cn("block size-full", !url && "animate-pulse bg-stone-200")}>
      {url && <img src={url} alt="" width={56} height={56} sizes="56px" loading="lazy" decoding="async" className="size-full object-cover" />}
    </span>
  );
};

const clamp = (n: number) => Math.min(0.98, Math.max(0.02, n));

const valueAt = (data: Float32Array, w: number, h: number, p: { x: number; y: number }) =>
  data[Math.min(h - 1, Math.floor(p.y * h)) * w + Math.min(w - 1, Math.floor(p.x * w))] ?? 0;
