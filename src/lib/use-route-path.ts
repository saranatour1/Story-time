import { useEffect, useRef, useState } from "react";
import { cachedPath, fetchPath, wantsPath, type Path } from "@/lib/road-path";
import type { LatLng, Transport } from "@/lib/story-steps";

const WAIT_MS = 2500;

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
    const settle = (path: Path | undefined) => {
      if (live) setDone((prev) => (prev?.key === key ? prev : { key, path }));
    };
    const timer = setTimeout(() => settle(undefined), WAIT_MS);
    void fetchPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }, transport).then(
      (path) => {
        clearTimeout(timer);
        settle(path);
      },
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, wanted, fromLat, fromLng, toLat, toLng, transport]);

  if (!wanted) return { path: undefined, settled: true };
  return done?.key === key
    ? { path: done.path, settled: true }
    : { path: undefined, settled: false };
};

type ChainStop = { lat: number; lng: number; transport?: Transport };
const AT_ONCE = 2;
const MAX_LEGS = 40;

export const useChainPaths = (stops: ChainStop[]): Array<Path | undefined> => {
  const key = stops.map((s) => `${s.transport ?? ""}:${s.lat},${s.lng}`).join(";");
  const chain = useRef(stops);
  chain.current = stops;
  const [found, setFound] = useState<{ key: string; paths: Array<Path | undefined> }>({
    key: "",
    paths: [],
  });

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
      return i <= MAX_LEGS &&
        prev &&
        s.transport &&
        paths[i] === undefined &&
        wantsPath(prev, s, s.transport)
        ? [i]
        : [];
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
