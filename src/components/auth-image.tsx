import { useMediaUrl } from "@/lib/use-media-url";

// Photos are private, so they load with the viewer's token and are shown
// from a blob URL instead of a public link.
export function AuthImage({ mediaId, alt }: { mediaId: string; alt: string }) {
  const { url, failed } = useMediaUrl(mediaId);

  if (failed) {
    return (
      <div className="grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground">
        Photo unavailable
      </div>
    );
  }
  if (!url) return <div className="aspect-video animate-pulse rounded-md bg-muted" />;
  return <img src={url} alt={alt} className="aspect-video w-full rounded-md object-cover" />;
}
