import { layoutPlaces, type MapPoint } from "./story-map";

// Places are encrypted free text with no real coordinates. We still want a
// MapLibre map that can draw legs, so each place gets a stable pseudo-location
// on a small atlas centred on western Europe. Same label → same spot.

/** Longitude / latitude pair used by MapLibre / mapcn. */
export type LngLat = [number, number];

// Soft atlas bounds — wide enough for a trip to feel like travel, narrow
// enough that every stop stays on screen together.
const WEST = -12;
const EAST = 8;
const SOUTH = 36;
const NORTH = 52;

export function pointToLngLat(p: MapPoint): LngLat {
  const lng = WEST + (p.x / 100) * (EAST - WEST);
  // Sheet y grows downward; latitude grows northward.
  const lat = NORTH - (p.y / 60) * (NORTH - SOUTH);
  return [round(lng), round(lat)];
}

export function layoutLngLats(labels: string[]): Map<string, LngLat> {
  const sheet = layoutPlaces(labels);
  const out = new Map<string, LngLat>();
  for (const [label, p] of sheet) out.set(label, pointToLngLat(p));
  return out;
}

const round = (v: number) => Math.round(v * 10000) / 10000;

// Sample a bent route between two places so MapRoute can animate progress.
// Planes arc north, boats wiggle, the rest take a gentle curve.
export function legCoordinates(from: LngLat, to: LngLat, transport: string, samples = 32): LngLat[] {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const mx = (lng1 + lng2) / 2;
  const my = (lat1 + lat2) / 2;
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let lift = Math.min(len * 0.25, 1.2);
  if (transport === "plane") lift = Math.min(len * 0.55, 3.5);
  if (transport === "boat") lift = Math.min(len * 0.18, 0.8);

  const points: LngLat[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (transport === "boat") {
      // Two-hump wave along the normal.
      const wave = Math.sin(t * Math.PI * 2) * lift;
      points.push([
        round(lng1 + dx * t + nx * wave),
        round(lat1 + dy * t + ny * wave),
      ]);
    } else {
      // Quadratic bezier through a lifted midpoint.
      const cx = mx + nx * lift;
      const cy = my + ny * lift;
      const omt = 1 - t;
      points.push([
        round(omt * omt * lng1 + 2 * omt * t * cx + t * t * lng2),
        round(omt * omt * lat1 + 2 * omt * t * cy + t * t * lat2),
      ]);
    }
  }
  return points;
}

export function fitBounds(points: LngLat[]): { center: LngLat; zoom: number } {
  if (points.length === 0) return { center: [-2, 44], zoom: 4 };
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.4);
  const zoom = Math.max(3.2, Math.min(8.5, 7.2 - Math.log2(span)));
  return {
    center: [round((minLng + maxLng) / 2), round((minLat + maxLat) / 2)],
    zoom: round(zoom),
  };
}
