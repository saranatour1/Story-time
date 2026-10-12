import { useMediaUrl, useWhenSeen, type MediaVariant } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// Photos are private, so they load with the viewer's token and are shown
// from a blob URL instead of a public link. `className` reshapes all three
// states (e.g. a square thumbnail). Lists ask for the stored thumbnail and
// wait until the tile is near the viewport; the fetch itself cannot be deferred
// by loading=lazy, because the bytes are not a public URL.
export function AuthImage({
  mediaId,
  alt,
  className,
  variant = "thumb",
  width,
  height,
  sizes,
}: {
  mediaId: string;
  alt: string;
  className?: string;
  variant?: MediaVariant;
  width?: number;
  height?: number;
  sizes?: string;
}) {
  const [ref, seen] = useWhenSeen();
  const { url, failed } = useMediaUrl(seen ? mediaId : undefined, variant);

  return (
    <div ref={ref} className={cn("aspect-video w-full overflow-hidden rounded-md bg-muted", !url && !failed && "animate-pulse", className)}>
      {failed ? (
        <span className="grid size-full place-items-center text-xs text-muted-foreground">Photo unavailable</span>
      ) : (
        url && (
          <img
            src={url}
            alt={alt}
            width={width}
            height={height}
            sizes={sizes}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
        )
      )}
    </div>
  );
}

// Videos load the same way. ponytail: the whole file is fetched before it
// plays (no range requests); fine at the 50 MB cap, stream via signed URLs
// if longer videos are ever allowed.
export function AuthVideo({ mediaId, label }: { mediaId: string; label: string }) {
  const { url, failed } = useMediaUrl(mediaId);

  if (failed) {
    return (
      <div className="grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground">
        Video unavailable
      </div>
    );
  }
  if (!url) return <div className="aspect-video animate-pulse rounded-md bg-muted" />;
  return <video src={url} controls preload="metadata" aria-label={label} className="aspect-video w-full rounded-md bg-black" />;
}
