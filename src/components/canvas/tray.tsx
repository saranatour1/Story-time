import { ImageIcon, TypeIcon } from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";
import type { MomentView } from "@/components/event/types";
import { STARTERS, type StarterId } from "@/lib/canvas/fill";
import { FRAME_LOOKS, FRAME_SIZES, PAPERS, TAPES, paperLook } from "@/lib/canvas/look";
import { useMediaUrl } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// What can go on the canvas. Drag any of it onto a frame or the desk, or click
// it to drop it in the middle of what you're looking at.

// What a drag carries. The canvas reads it back on drop.
export type Item =
  | { what: "frame"; size: (typeof FRAME_SIZES)[number]["id"]; look: string }
  | { what: "scrap"; paper: string }
  | { what: "tape"; look: string }
  | { what: "moment"; momentId: string }
  | { what: "photo"; mediaId: string }
  | { what: "starter"; id: StarterId };

export const DRAG_TYPE = "application/x-story-piece";

function drag(e: DragEvent, item: Item) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = "copy";
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-stone-300/70 py-2 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-1 font-mono text-[11px] tracking-[0.14em] text-stone-600 uppercase select-none">
        {title}
        <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-3 pt-2 pb-1">{children}</div>
    </details>
  );
}

const chip = "rounded-md border border-stone-300 bg-white/70 px-2 py-1 text-xs hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none";

function Thumb({ mediaId, className }: { mediaId: string; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? (
    <img src={url} alt="" draggable={false} className={cn("size-full object-cover", className)} />
  ) : (
    <div className="grid size-full place-items-center bg-stone-200 text-stone-400">
      <ImageIcon aria-hidden className="size-4" />
    </div>
  );
}

const firstPhoto = (m: MomentView) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat().find((b) => b.type === "photo");

export function Tray({
  moments,
  onTitle,
  onAdd,
  placedMoments,
  upload,
}: {
  moments: MomentView[];
  placedMoments: ReadonlySet<string>;
  // A click: put this in the middle of the view.
  onAdd: (item: Item) => void;
  // A title typed in: make it from letters.
  onTitle: (text: string) => void;
  // Where photos from the device are added.
  upload?: ReactNode;
}) {
  const [size, setSize] = useState<(typeof FRAME_SIZES)[number]["id"]>("poster");
  const [title, setTitle] = useState("");
  const photos = moments.flatMap((m) =>
    [m.blocks, ...m.stops.map((s) => s.blocks)].flat().flatMap((b) => (b.type === "photo" ? [{ mediaId: b.mediaId as string, momentId: m._id as string }] : [])),
  );

  return (
    <aside aria-label="Things to add" className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-stone-300 bg-[#efe9dc] text-stone-900">
      {upload !== undefined && <div className="border-b border-stone-300/70 p-3 [&>button]:w-full">{upload}</div>}
      <Section title="Frames" open>
        <div className="mb-2 flex flex-wrap gap-1">
          {FRAME_SIZES.map((s) => (
            <button key={s.id} type="button" aria-pressed={size === s.id} className={cn(chip, size === s.id && "border-stone-900 bg-white")} onClick={(e) => { e.stopPropagation(); setSize(s.id); }}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {FRAME_LOOKS.map((l) => (
            <button
              key={l.id}
              type="button"
              draggable
              title={`${l.name} frame`}
              aria-label={`Add a ${l.name} frame`}
              onDragStart={(e) => drag(e, { what: "frame", size, look: l.id })}
              onClick={() => onAdd({ what: "frame", size, look: l.id })}
              className="relative aspect-[3/2] overflow-hidden rounded-sm border border-stone-400/60 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              style={{ background: l.page }}
            >
              <span className="absolute -bottom-1 -left-1 size-4 rounded-full" style={{ background: l.accent }} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Ready-made pages" open>
        <ul className="space-y-1.5">
          {STARTERS.map((st) => (
            <li key={st.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => drag(e, { what: "starter", id: st.id })}
                onClick={() => onAdd({ what: "starter", id: st.id })}
                className="w-full rounded-md border border-stone-300 bg-white/70 px-2 py-1.5 text-left text-xs hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                <span className="block font-medium">{st.name}</span>
                <span className="block text-stone-500">{st.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Title" open>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() === "") return;
            onTitle(title.trim());
            setTitle("");
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={24}
            placeholder="Cut a title"
            aria-label="Words for a title cut from letters"
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <button type="submit" className={chip} aria-label="Add the title">
            <TypeIcon aria-hidden className="size-3.5" />
          </button>
        </form>
      </Section>

      <Section title="Paper" open>
        <div className="grid grid-cols-3 gap-1.5">
          {PAPERS.map((p) => (
            <button
              key={p.id}
              type="button"
              draggable
              title={`${p.name} scrap`}
              aria-label={`Add a ${p.name} scrap of paper`}
              onDragStart={(e) => drag(e, { what: "scrap", paper: p.id })}
              onClick={() => onAdd({ what: "scrap", paper: p.id })}
              className="aspect-[3/2] rounded-sm border border-stone-400/50 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              style={{ background: paperLook(p.id).page, fontFamily: "var(--font-hand)", color: p.ink }}
            >
              Aa
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tape">
        <div className="grid grid-cols-2 gap-1.5">
          {TAPES.map((t) => (
            <button
              key={t.id}
              type="button"
              draggable
              title={t.name}
              aria-label={`Add ${t.name} tape`}
              onDragStart={(e) => drag(e, { what: "tape", look: t.id })}
              onClick={() => onAdd({ what: "tape", look: t.id })}
              className="h-6 rounded-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              style={{ background: t.color, backgroundImage: t.stripe ? "repeating-linear-gradient(90deg, rgba(255,255,255,.42) 0 6px, transparent 6px 12px)" : undefined }}
            />
          ))}
        </div>
      </Section>

      <Section title={`Moments · ${moments.length}`} open>
        {moments.length === 0 ? (
          <p className="text-xs text-stone-500">Moments you add show up here.</p>
        ) : (
          <ul className="space-y-1.5">
            {moments.map((m) => {
              const photo = firstPhoto(m);
              const placed = placedMoments.has(m._id);
              return (
                <li key={m._id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => drag(e, { what: "moment", momentId: m._id })}
                    onClick={() => onAdd({ what: "moment", momentId: m._id })}
                    className="flex w-full items-center gap-2 rounded-md border border-stone-300 bg-white/70 p-1 text-left hover:bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <span className="size-9 shrink-0 overflow-hidden rounded-sm">{photo?.type === "photo" ? <Thumb mediaId={photo.mediaId} /> : <span className="grid size-full place-items-center bg-stone-200 text-xs">✎</span>}</span>
                    <span className="min-w-0 text-xs leading-tight">
                      <span className="block truncate font-medium">{m.place?.split(",")[0] ?? "A moment"}</span>
                      <span className="block truncate text-stone-500">{new Date(m.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{placed ? " · on the canvas" : ""}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Photos · ${photos.length}`}>
        {photos.length === 0 ? (
          <p className="text-xs text-stone-500">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1">
            {photos.map((p) => (
              <li key={p.mediaId}>
                <button
                  type="button"
                  draggable
                  aria-label="Add this photo"
                  onDragStart={(e) => drag(e, { what: "photo", mediaId: p.mediaId })}
                  onClick={() => onAdd({ what: "photo", mediaId: p.mediaId })}
                  className="aspect-square w-full overflow-hidden rounded-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  <Thumb mediaId={p.mediaId} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}
