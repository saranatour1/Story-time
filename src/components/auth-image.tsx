import { useMediaUrl, useWhenSeen, type MediaVariant } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

export const AuthImage = ({
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
}) => {
  const [ref, seen] = useWhenSeen();
  const { url, failed } = useMediaUrl(seen ? mediaId : undefined, variant);

  return (
    <div
      ref={ref}
      className={cn(
        "aspect-video w-full overflow-hidden rounded-md bg-muted",
        !url && !failed && "animate-pulse",
        className,
      )}
    >
      {failed ? (
        <span className="grid size-full place-items-center text-xs text-muted-foreground">
          Photo unavailable
        </span>
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
};

export const AuthVideo = ({ mediaId, label }: { mediaId: string; label: string }) => {
  const { url, failed } = useMediaUrl(mediaId);

  if (failed) {
    return (
      <div className="grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground">
        Video unavailable
      </div>
    );
  }
  if (!url) return <div className="aspect-video animate-pulse rounded-md bg-muted" />;
  return (
    <video
      src={url}
      controls
      preload="metadata"
      aria-label={label}
      className="aspect-video w-full rounded-md bg-black"
    />
  );
};
