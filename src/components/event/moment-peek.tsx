import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import { useRef, useState } from "react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/local-time";
import { cn } from "@/lib/utils";

type Media = Extract<MomentView["blocks"][number], { type: "photo" | "video" }>;

// One at a time. Native scroll-snap does the swipe and the glide; the arrows
// and the keyboard just scroll it.
const Gallery = ({ media }: { media: Media[] }) => {
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const next = Math.max(0, Math.min(media.length - 1, to));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const many = media.length > 1;
  return (
    <div
      className="group relative -mx-4"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(at - 1);
        else if (e.key === "ArrowRight") go(at + 1);
        else return;
        e.preventDefault();
      }}
    >
      <div
        ref={strip}
        tabIndex={many ? 0 : undefined}
        aria-label={many ? `Photo ${at + 1} of ${media.length}` : undefined}
        onScroll={(e) =>
          setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
        }
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
      >
        {media.map((b) => (
          <div
            key={b.mediaId}
            className="grid h-[60svh] w-full shrink-0 snap-center place-items-center bg-muted/40"
          >
            {b.type === "video" ? (
              <AuthVideo mediaId={b.mediaId} label="Video" />
            ) : (
              <AuthImage
                mediaId={b.mediaId}
                alt=""
                variant="full"
                className="aspect-auto size-full rounded-none bg-transparent [&_img]:size-full [&_img]:object-contain"
              />
            )}
          </div>
        ))}
      </div>
      {many && (
        <>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Previous"
            disabled={at === 0}
            onClick={() => go(at - 1)}
            className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity group-hover:opacity-90 focus-visible:opacity-90 disabled:!opacity-0 max-sm:hidden"
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Next"
            disabled={at === media.length - 1}
            onClick={() => go(at + 1)}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity group-hover:opacity-90 focus-visible:opacity-90 disabled:!opacity-0 max-sm:hidden"
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {media.map((b, i) => (
              <span
                key={b.mediaId}
                className={cn(
                  "size-1.5 rounded-full bg-white/60 shadow transition-all",
                  i === at && "w-4 bg-white",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const MomentPeek = ({
  moment,
  onEdit,
  onClose,
}: {
  moment: MomentView;
  onEdit?: () => void;
  onClose: () => void;
}) => {
  const blocks = [...moment.blocks, ...moment.stops.flatMap((stop) => stop.blocks)];
  const media = blocks.filter((b): b is Media => b.type === "photo" || b.type === "video");
  const hidden = media.filter((b) => b.hidden).length;
  const places = [moment.place, ...moment.stops.map((stop) => stop.place)].filter(Boolean);
  const when = formatDateTime(moment.startsAt, moment.tzOffsetMinutes, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{places.length > 0 ? places.join(" → ") : when}</DialogTitle>
          <DialogDescription>
            {places.length > 0 ? `${when} · ` : ""}
            {moment.authorName ?? "Someone"}
          </DialogDescription>
        </DialogHeader>
        {media.length > 0 && (
          <Gallery media={media} />
        )}
        {hidden > 0 && (
          <p className="text-xs text-muted-foreground">
            {hidden} of these {hidden === 1 ? "is" : "are"} hidden from other people.
          </p>
        )}
        {blocks.map((b, i) =>
          b.type === "note" || b.type === "feeling" ? (
            <p key={i} className="text-sm whitespace-pre-line">
              {b.type === "feeling" && b.mood ? `${b.mood} ` : ""}
              {b.text}
            </p>
          ) : b.type === "link" ? (
            <a
              key={i}
              href={b.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-sm underline"
            >
              {b.title ?? b.url}
            </a>
          ) : null,
        )}
        {moment.labels.length > 0 && (
          <p className="text-xs text-muted-foreground">{moment.labels.join(" · ")}</p>
        )}
        {onEdit && (
          <div>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilIcon /> Edit
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
