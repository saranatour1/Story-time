import { useAuthToken } from "@convex-dev/auth/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type RefCallback } from "react";
import { evictUnused } from "./image-load";

export type MediaVariant = "full" | "thumb";

type MediaState = { url: string | null; failed: boolean };
type Entry = { state: MediaState; users: Set<() => void>; abort: AbortController };

// Who is asking for a picture: the signed-in viewer ("bearer"), or someone who
// opened a share link ("share"), whose token is the only credential.
export type MediaAuth = { kind: "bearer" | "share"; token: string };

// A shared story provides its link's token. Without a provider, pictures are
// fetched with the signed-in viewer's session.
export const MediaAuthContext = createContext<MediaAuth | null>(null);

function useMediaAuth(): MediaAuth | null {
  const shared = useContext(MediaAuthContext);
  const token = useAuthToken();
  if (shared) return shared;
  return token ? { kind: "bearer", token } : null;
}

const IDLE: MediaState = { url: null, failed: false };

// Blob URLs by media id, least recently used first, so a picture shown again
// (the next scene, the feed after the story) appears at once. Keyed by id
// alone: a viewer only ever learns ids the server lets them see, and a fresh
// token mustn't refetch what's on screen.
// ponytail: keeps up to 40 blobs nobody is showing; raise it if revisits
// still flash, or move to the Cache API if memory becomes the problem.
const MAX = 40;
const cache = new Map<string, Entry>();

function cacheKey(mediaId: string, variant: MediaVariant): string {
  return `${mediaId}:${variant}`;
}

function load(mediaId: string, auth: MediaAuth | null, variant: MediaVariant): Entry | undefined {
  const key = cacheKey(mediaId, variant);
  const hit = cache.get(key);
  cache.delete(key);
  // A failure is retried once nobody is showing it.
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
  fetch(`/api/media/${mediaId}${query}`, { headers: { Authorization: authorization }, signal: entry.abort.signal })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("failed"))))
    .then((blob) => {
      if (!entry.abort.signal.aborted) settle({ url: URL.createObjectURL(blob), failed: false });
    })
    .catch(() => settle({ url: null, failed: true }));
  return entry;
}

// Drops the oldest entries nobody is showing; one still on screen keeps its URL.
function evict() {
  evictUnused(
    cache,
    MAX,
    (entry) => entry.users.size === 0,
    (entry) => {
      entry.abort.abort();
      if (entry.state.url) URL.revokeObjectURL(entry.state.url);
    },
  );
}

// On sign-out: every picture leaves memory, so the next person at this browser
// can't see the last one's. Pictures on screen fall back to the placeholder.
export function clearMediaCache() {
  for (const [id, entry] of cache) {
    cache.delete(id);
    entry.abort.abort();
    if (entry.state.url) URL.revokeObjectURL(entry.state.url);
    entry.state = IDLE;
    for (const notify of entry.users) notify();
  }
}

// Private media can't use a plain <img src>, so fetch it with the viewer's
// token and hand back a blob URL. `failed` is set when it can't be shown.
export function useMediaUrl(mediaId: string | undefined, variant: MediaVariant = "full"): MediaState {
  const auth = useMediaAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  // Subscribes again once access arrives, not each time a token is refreshed.
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
  return useSyncExternalStore(subscribe, () => (key && cache.get(key)?.state) || IDLE, () => IDLE);
}

// True once `node` has intersected the viewport (with a margin), or immediately
// where the browser has no IntersectionObserver. The fetch waits on this, because
// loading=lazy cannot defer a blob URL we create ourselves.
export function useWhenSeen(): [RefCallback<Element>, boolean] {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback<RefCallback<Element>>((node) => {
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
  }, [seen]);
  return [ref, seen];
}

// Starts loading pictures that are about to be shown.
export function usePrefetchMedia(mediaIds: string[]) {
  const auth = useMediaAuth();
  const ids = mediaIds.join(" ");
  // Taken apart, so the effect reruns for a new token rather than a new object.
  const kind = auth?.kind;
  const token = auth?.token;
  useEffect(() => {
    if (!ids || kind === undefined || token === undefined) return;
    for (const id of ids.split(" ")) load(id, { kind, token }, "full");
    evict();
  }, [ids, kind, token]);
}
