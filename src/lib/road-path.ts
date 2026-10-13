import { z } from "zod";
import { distanceMeters } from "./photo-groups";
import type { LatLng, Transport } from "./story-steps";

// A route as MapLibre takes it: [longitude, latitude] pairs.
export type Path = Array<[number, number]>;

// Which network each way of travelling follows. A plane or a boat has no road
// to follow, and "another way" could be anything, so those stay arcs.
type Network = "foot" | "bike" | "car" | "rail";
const NETWORKS: Partial<Record<Transport, Network>> = { walk: "foot", bike: "bike", car: "car", bus: "car", train: "rail" };
export const networkOf = (transport: Transport): Network | undefined => NETWORKS[transport];

// Past this it is a journey, not a leg, and the public routers aren't asked.
const MAX_ROUTED_KM = 600;
// Under this a leg comes back in full detail; a longer one is seen from far
// away, so a simplified line does.
const FULL_DETAIL_KM = 25;
// Fewer than this is a stop on the spot, which an arc draws well enough.
const MIN_ROUTED_M = 150;
// The most points a path keeps: the transport rides it frame by frame.
const MAX_POINTS = 400;
const TIMEOUT_MS = 4000;
// A miss is forgotten after this, in case the router was only busy.
const MISS_MS = 60_000;

// What the routers learn of a trip is where two stops are, so those are
// rounded to about 100 m first: enough to find the street, not the door.
export const roundForRouting = (g: LatLng): LatLng => ({
  lat: Math.round(g.lat * 1000) / 1000,
  lng: Math.round(g.lng * 1000) / 1000,
});

// Whether a path is worth asking for: a way of travelling with a network, and
// a leg that is neither a hop on the spot nor a whole journey.
export const wantsPath = (from: LatLng, to: LatLng, transport: Transport): boolean => {
  if (networkOf(transport) === undefined) return false;
  const m = distanceMeters(from, to);
  return m >= MIN_ROUTED_M && m <= MAX_ROUTED_KM * 1000;
};

// Road networks come from OpenStreetMap's public OSRM servers (the same kind of
// call mapcn's own delivery-tracker example makes); rail from OpenRailRouting.
export const routeUrl = (network: Network, from: LatLng, to: LatLng): string => {
  const a = roundForRouting(from);
  const b = roundForRouting(to);
  if (network === "rail") {
    return `https://routing.openrailrouting.org/route?point=${a.lat},${a.lng}&point=${b.lat},${b.lng}&profile=all_tracks&points_encoded=false&instructions=false`;
  }
  const overview = distanceMeters(a, b) / 1000 > FULL_DETAIL_KM ? "simplified" : "full";
  return `https://routing.openstreetmap.de/routed-${network}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=${overview}&geometries=geojson`;
};

// Both services answer with a GeoJSON line; only its shape is trusted.
const line = z.array(z.array(z.number()).min(2)).min(2);
const osrm = z.object({ routes: z.array(z.object({ geometry: z.object({ coordinates: line }) })).min(1) });
const rail = z.object({ paths: z.array(z.object({ points: z.object({ coordinates: line }) })).min(1) });

export const parseRoute = (network: Network, json: unknown): Path | undefined => {
  if (network === "rail") {
    const parsed = rail.safeParse(json);
    return parsed.success ? tidy(parsed.data.paths[0]?.points.coordinates) : undefined;
  }
  const parsed = osrm.safeParse(json);
  return parsed.success ? tidy(parsed.data.routes[0]?.geometry.coordinates) : undefined;
};

// Longitude and latitude only (a service may add elevation), within the world,
// and thinned to a size the map can animate along.
const tidy = (coordinates: number[][] | undefined): Path | undefined => {
  const path: Path = [];
  for (const c of coordinates ?? []) {
    const [lng, lat] = c;
    if (lng === undefined || lat === undefined || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
    path.push([lng, lat]);
  }
  return path.length < 2 ? undefined : simplifyPath(path);
};

// Douglas-Peucker, loosening the tolerance until the path is small enough. The
// ends and the shape stay; only points that sit on the line anyway go.
export const simplifyPath = (path: Path, maxPoints = MAX_POINTS): Path => {
  let kept = path;
  // About 1 m, in degrees; doubled until few enough points remain.
  for (let tolerance = 1e-5; kept.length > maxPoints; tolerance *= 2) kept = douglasPeucker(path, tolerance);
  return kept;
};

const douglasPeucker = (path: Path, tolerance: number): Path => {
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const spans: Array<[number, number]> = [[0, path.length - 1]];
  for (let span = spans.pop(); span !== undefined; span = spans.pop()) {
    const [lo, hi] = span;
    const a = path[lo];
    const b = path[hi];
    if (!a || !b) continue;
    let far = -1;
    let worst = tolerance;
    for (let i = lo + 1; i < hi; i++) {
      const p = path[i];
      if (!p) continue;
      const d = offLine(p, a, b);
      if (d > worst) [far, worst] = [i, d];
    }
    if (far !== -1) {
      keep[far] = 1;
      spans.push([lo, far], [far, hi]);
    }
  }
  return path.filter((_, i) => keep[i] === 1);
};

// How far p sits from the segment a-b, in degrees (longitude shrunk by latitude).
const offLine = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const [px, py, ax, ay, bx, by] = [p[0] * k, p[1], a[0] * k, a[1], b[0] * k, b[1]];
  const [dx, dy] = [bx - ax, by - ay];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Every scene asks for the same legs again and again (the film mounts a scene
// ahead, then shows it; a replay shows it again), so each is asked for once. In
// memory only: the coordinates are never written anywhere.
const pending = new Map<string, Promise<Path | undefined>>();
const found = new Map<string, Path>();

export const fetchPath = (from: LatLng, to: LatLng, transport: Transport): Promise<Path | undefined> => {
  const network = networkOf(transport);
  if (network === undefined || !wantsPath(from, to, transport)) return Promise.resolve(undefined);
  const url = routeUrl(network, from, to);
  let asking = pending.get(url);
  if (asking === undefined) {
    asking = request(network, url);
    pending.set(url, asking);
    void asking.then((path) => {
      if (path !== undefined) found.set(url, path);
      else setTimeout(() => pending.delete(url), MISS_MS);
    });
  }
  return asking;
};

// The path for a leg if it has already come back, without asking for it.
export const cachedPath = (from: LatLng, to: LatLng, transport: Transport): Path | undefined => {
  const network = networkOf(transport);
  return network === undefined ? undefined : found.get(routeUrl(network, from, to));
};

const request = async (network: Network, url: string): Promise<Path | undefined> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    return parseRoute(network, body);
  } catch {
    // Offline, blocked, slow or busy: the arc stands in.
    return undefined;
  }
};

// For tests: forget everything asked for.
export const forgetPaths = () => {
  pending.clear();
  found.clear();
};
