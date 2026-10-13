import { useEffect, useRef, useState } from "react";
import { cachedPath, fetchPath, wantsPath, type Path } from "@/lib/road-path";
import type { LatLng, Transport } from "@/lib/story-steps";

// How long a scene waits for a route before it settles for the arc. A scene is
// mounted ahead of view, so the route is normally there before it is seen.
const WAIT_MS = 2500;

// The path a leg follows on the roads or rails, or nothing when it has none to
// follow (a plane, a hop on the spot, no router, too slow). `settled` says the
// answer is final for this leg: until then a scene holds back its animation, so
// it never starts along an arc and bends onto a street halfway. A route that
// turns up after the wait is kept for the next time, not swapped in.
export const useRoutePath = (
  from: LatLng | undefined,
  to: LatLng | undefined,
  transport: Transport,
): { path: Path | undefined; settled: boolean } => {
  const [fromLat, fromLng, toLat, toLng] = [from?.lat, from?.lng, to?.lat, to?.lng];
  const wanted =
    fromLat !== undefined &&
    fromLng !== undefined &&
    toLat !== undefined &&
    toLng !== undefined &&
    wantsPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, transport);
  const key = wanted ? `${transport}:${fromLat},${fromLng};${toLat},${toLng}` : "";
  const [done, setDone] = useState<{ key: string; path: Path | undefined } | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // The first answer for a leg is the one kept, whether it is the route or the wait running out.
    const settle = (path: Path | undefined) => {
      if (live) setDone((prev) => (prev?.key === key ? prev : { key, path }));
    };
    const timer = setTimeout(() => settle(undefined), WAIT_MS);
    void fetchPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, transport).then((path) => {
      clearTimeout(timer);
      settle(path);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, wanted, fromLat, fromLng, toLat, toLng, transport]);

  if (!wanted) return { path: undefined, settled: true };
  return done?.key === key ? { path: done.path, settled: true } : { path: undefined, settled: false };
};

type ChainStop = { lat: number; lng: number; transport?: Transport };
// Legs asked for at once: enough to fill a map quickly, few enough to be polite
// to the public routers.
const AT_ONCE = 2;
// The first legs of a long story are drawn on the streets; past this, arcs.
const MAX_LEGS = 40;

// The streets or tracks for every leg of a chain of stops, filled in as they
// arrive, a couple at a time in the background: entry i is the way into stop
// i, or undefined while it is an arc (no network, still coming, or refused).
export const useChainPaths = (stops: ChainStop[]): Array<Path | undefined> => {
  const key = stops.map((s) => `${s.transport ?? ""}:${s.lat},${s.lng}`).join(";");
  const chain = useRef(stops);
  chain.current = stops;
  const [found, setFound] = useState<{ key: string; paths: Array<Path | undefined> }>({ key: "", paths: [] });

  useEffect(() => {
    const list = chain.current;
    let live = true;
    const paths: Array<Path | undefined> = list.map((s, i) => {
      const prev = list[i - 1];
      return prev && s.transport ? cachedPath(prev, s, s.transport) : undefined;
    });
    setFound({ key, paths: [...paths] });
    const todo = list.flatMap((s, i) => {
      const prev = list[i - 1];
      return i <= MAX_LEGS && prev && s.transport && paths[i] === undefined && wantsPath(prev, s, s.transport) ? [i] : [];
    });
    let next = 0;
    const work = async () => {
      while (live && next < todo.length) {
        const i = todo[next++];
        const s = i === undefined ? undefined : list[i];
        const prev = i === undefined ? undefined : list[i - 1];
        if (i === undefined || !s?.transport || !prev) continue;
        const path = await fetchPath(prev, s, s.transport);
        if (!live || path === undefined) continue;
        paths[i] = path;
        setFound({ key, paths: [...paths] });
      }
    };
    for (let k = 0; k < AT_ONCE; k++) void work();
    return () => {
      live = false;
    };
  }, [key]);

  return found.key === key ? found.paths : [];
};
