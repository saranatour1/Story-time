import { useMediaUrl } from "@/lib/use-media-url";

// The picture on top, blurred to colour alone and filling the whole screen
// behind the print, so a stop is bathed in its own light rather than sitting
// in a dark room. Purely decorative.
export function SceneBackdrop({ mediaId }: { mediaId: string }) {
  const { url } = useMediaUrl(mediaId);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {url && (
        <img
          src={url}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-3xl saturate-150 animate-in fade-in duration-1000"
        />
      )}
      {/* Darker at the edges and under the caption, so the print and the words stand out. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,transparent_20%,#141210_90%),linear-gradient(to_bottom,transparent_55%,rgb(20_18_16/0.85)_100%)]" />
    </div>
  );
}
