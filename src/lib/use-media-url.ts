import { useAuthToken } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";

// Private media can't use a plain <img src>, so fetch it with the viewer's
// token and hand back a blob URL. `failed` is set when it can't be shown.
export function useMediaUrl(mediaId: string | undefined) {
  const token = useAuthToken();
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });

  useEffect(() => {
    if (!mediaId || !token) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`/api/media/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => !cancelled && setState({ url: null, failed: true }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, token]);

  return mediaId ? state : { url: null, failed: false };
}
