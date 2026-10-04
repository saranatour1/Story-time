import { useAuthToken } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";

// Photos are private, so they load with the viewer's token and are shown
// from a blob URL instead of a public link.
export function AuthImage({ mediaId, alt }: { mediaId: string; alt: string }) {
  const token = useAuthToken();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let url: string | null = null;
    let cancelled = false;
    fetch(`/api/media/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mediaId, token]);

  if (failed) return <div className="grid aspect-video place-items-center rounded-md bg-muted text-xs text-muted-foreground">Photo unavailable</div>;
  if (!src) return <div className="aspect-video animate-pulse rounded-md bg-muted" />;
  return <img src={src} alt={alt} className="aspect-video w-full rounded-md object-cover" />;
}
