import { useAuthToken } from "@convex-dev/auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from "react";
import { evictUnused } from "./image-load";

export type MediaVariant = "full" | "thumb";

type MediaState = { url: string | null; failed: boolean };
type Entry = { state: MediaState; users: Set<() => void>; abort: AbortController };

export type MediaAuth = { kind: "bearer" | "share"; token: string };

export const MediaAuthContext = createContext<MediaAuth | null>(null);

const useMediaAuth = (): MediaAuth | null => {
  const shared = useContext(MediaAuthContext);
  const token = useAuthToken();
  if (shared) return shared;
  return token ? { kind: "bearer", token } : null;
};

const IDLE: MediaState = { url: null, failed: false };

const MAX_IDLE_BLOBS = 40;
const cache = new Map<string, Entry>();

const cacheKey = (mediaId: string, variant: MediaVariant): string => {
  return `${mediaId}:${variant}`;
};

const load = (
  mediaId: string,
  auth: MediaAuth | null,
  variant: MediaVariant,
): Entry | undefined => {
  const key = cacheKey(mediaId, variant);
  const hit = cache.get(key);
  cache.delete(key);
  if (hit && !(hit.state.failed && hit.users.size === 0)) {
    cache.set(key, hit);
    return hit;
  }
  if (!auth) return undefined;
  const entry: Entry = { state: IDLE, users: new Set(), abort: new AbortController() };
  cache.set(key, entry);
  const settle = (state: MediaState) => {
    entry.state = state;
    for (const notify of entry.users) notify();
  };
  const authorization = auth.kind === "share" ? `Share ${auth.token}` : `Bearer ${auth.token}`;
  const query = variant === "thumb" ? "?variant=thumb" : "";
  fetch(`/api/media/${mediaId}${query}`, {
    headers: { Authorization: authorization },
    signal: entry.abort.signal,
  })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
    .then((blob) => {
      if (!entry.abort.signal.aborted) settle({ url: URL.createObjectURL(blob), failed: false });
    })
    .catch(() => settle({ url: null, failed: true }));
  return entry;
};

const evict = () => {
  evictUnused(
    cache,
    MAX_IDLE_BLOBS,
    (entry) => entry.users.size === 0,
    (entry) => {
      entry.abort.abort();
      if (entry.state.url) URL.revokeObjectURL(entry.state.url);
    },
  );
};

export const clearMediaCache = () => {
  for (const [id, entry] of cache) {
    cache.delete(id);
    entry.abort.abort();
    if (entry.state.url) URL.revokeObjectURL(entry.state.url);
    entry.state = IDLE;
    for (const notify of entry.users) notify();
  }
};

export const useMediaUrl = (
  mediaId: string | undefined,
  variant: MediaVariant = "full",
): MediaState => {
  const auth = useMediaAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const kind = auth?.kind;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!mediaId) return () => {};
      const entry = load(mediaId, authRef.current, variant);
      entry?.users.add(notify);
      evict();
      return () => {
        entry?.users.delete(notify);
        evict();
      };
    },
    [mediaId, kind, variant],
  );
  const key = mediaId ? cacheKey(mediaId, variant) : "";
  return useSyncExternalStore(
    subscribe,
    () => (key && cache.get(key)?.state) || IDLE,
    () => IDLE,
  );
};

export const useWhenSeen = (): [RefCallback<Element>, boolean] => {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback<RefCallback<Element>>(
    (node) => {
      observer.current?.disconnect();
      if (!node || seen) return;
      if (typeof IntersectionObserver !== "function") {
        setSeen(true);
        return;
      }
      const next = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setSeen(true);
            next.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      next.observe(node);
      observer.current = next;
    },
    [seen],
  );
  return [ref, seen];
};

export const usePrefetchMedia = (mediaIds: string[]) => {
  const auth = useMediaAuth();
  const ids = mediaIds.join(" ");
  const kind = auth?.kind;
  const token = auth?.token;
  useEffect(() => {
    if (!ids || kind === undefined || token === undefined) return;
    for (const id of ids.split(" ")) load(id, { kind, token }, "full");
    evict();
  }, [ids, kind, token]);
};
