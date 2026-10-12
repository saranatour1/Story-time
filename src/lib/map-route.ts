// How a leg looks on a real map: it bows as it crosses, and its progress eases
// in and out. Shared by the film's map and the memoir's, so a leg drawn in
// either matches the other.

type Point = [number, number];

// Planes arc high; everything else bends a little, as on the drawn map.
export const bend = (transport: string) => (transport === "plane" ? 0.3 : 0.08);

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// The same bow MapArc draws, so the leg on its way matches the ones behind
// it: a quadratic curve, the far end unwrapped to cross the shorter way.
export const curve = (from: Point, to: Point, k: number, samples = 64): Point[] => {
  const [x0, y0] = from;
  const x2 = to[0] - from[0] > 180 ? to[0] - 360 : to[0] - from[0] < -180 ? to[0] + 360 : to[0];
  const y2 = to[1];
  const d = Math.hypot(x2 - x0, y2 - y0);
  if (d === 0) return [from, [x2, y2]];
  const cx = (x0 + x2) / 2 - ((y2 - y0) / d) * d * k;
  const cy = (y0 + y2) / 2 + ((x2 - x0) / d) * d * k;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2];
  });
};
