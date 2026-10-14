import { localParts } from "./local-time";

export type Geo = { lat: number; lng: number };

// A photo or video: when it was taken and, if known, where and the camera's
// UTC offset at the time.
export type PhotoPoint = { id: string; takenAt: number; offsetMinutes?: number; geo?: Geo };

// Photos taken together, in time order. The stop's time is its first
// photo's; its place is the median of their locations.
export type PhotoStop = { photos: PhotoPoint[]; startsAt: number; geo?: Geo };

// One local calendar day. Each moment is a journey of stops; a day only
// needs more than one when its photos can't fit in one moment.
export type PhotoDay = { day: string; moments: PhotoStop[][] };

export const STOP_GAP_MS = 45 * 60_000;
export const STOP_RADIUS_M = 1000;
// The server's caps: stops per moment, and items per stop.
export const MAX_STOPS = 10;
export const MAX_PHOTOS_PER_STOP = 20;

// Great-circle distance, good enough at city scale.
export const distanceMeters = (a: Geo, b: Geo): number => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

// The clock where the photo was taken, as a Date to read in UTC: at the
// camera's offset, else the browser's zone.
export const localClock = (ms: number, offsetMinutes?: number): Date => {
  return localParts(ms, offsetMinutes);
};

// YYYY-MM-DD on that clock.
export const dayKey = (ms: number, offsetMinutes?: number): string => {
  return localClock(ms, offsetMinutes).toISOString().slice(0, 10);
};

// The viewer's calendar day, as the same YYYY-MM-DD the lists already use.
export const viewerDay = (now = Date.now()): string => {
  return dayKey(now, -new Date(now).getTimezoneOffset());
};

const byTime = (a: PhotoPoint, b: PhotoPoint) => a.takenAt - b.takenAt || a.id.localeCompare(b.id);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const toStop = (photos: PhotoPoint[]): PhotoStop => {
  const sorted = [...photos].sort(byTime);
  const geos = sorted.flatMap((p) => (p.geo ? [p.geo] : []));
  return {
    photos: sorted,
    startsAt: sorted[0]?.takenAt ?? 0,
    geo:
      geos.length > 0
        ? { lat: median(geos.map((g) => g.lat)), lng: median(geos.map((g) => g.lng)) }
        : undefined,
  };
};

const chunk = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

// Sorts photos into days, moments and stops. A new stop starts after a gap
// of more than 45 minutes, or when a photo was taken over 1 km from where
// the stop began (when both are known). A day with more than 10 stops merges
// the neighbours closest in time until it fits; if the per-stop cap stops
// that, the rest spills into a second moment for the day.
export const groupPhotos = (
  points: PhotoPoint[],
  {
    gapMs = STOP_GAP_MS,
    radiusM = STOP_RADIUS_M,
    maxStops = MAX_STOPS,
    maxPhotos = MAX_PHOTOS_PER_STOP,
  } = {},
): PhotoDay[] => {
  const sorted = [...points].sort(byTime);

  const runs: PhotoPoint[][] = [];
  let current: PhotoPoint[] = [];
  // Where the current stop began: its first photo with a location.
  let anchor: Geo | undefined;
  for (const p of sorted) {
    const last = current.at(-1);
    const moved =
      p.geo !== undefined && anchor !== undefined && distanceMeters(anchor, p.geo) > radiusM;
    if (last && (p.takenAt - last.takenAt > gapMs || moved)) {
      runs.push(current);
      current = [];
      anchor = undefined;
    }
    current.push(p);
    anchor ??= p.geo;
  }
  if (current.length > 0) runs.push(current);

  const days = new Map<string, PhotoStop[]>();
  for (const photos of runs.flatMap((run) => chunk(run, maxPhotos))) {
    const stop = toStop(photos);
    const key = dayKey(stop.startsAt, stop.photos[0]?.offsetMinutes);
    days.set(key, [...(days.get(key) ?? []), stop]);
  }

  return [...days].map(([day, stops]) => {
    while (stops.length > maxStops) {
      let best = -1;
      let bestGap = Infinity;
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1]!;
        const b = stops[i]!;
        if (a.photos.length + b.photos.length > maxPhotos) continue;
        const gap = b.startsAt - a.photos.at(-1)!.takenAt;
        if (gap < bestGap) {
          best = i;
          bestGap = gap;
        }
      }
      if (best === -1) break;
      stops.splice(best - 1, 2, toStop([...stops[best - 1]!.photos, ...stops[best]!.photos]));
    }
    return { day, moments: chunk(stops, maxStops) };
  });
};
