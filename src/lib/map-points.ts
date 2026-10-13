import type { StoryMoment } from "../components/event/types";
import type { Transport } from "../components/event/transport";
import { stopsOf } from "./story-steps";

// A stop with coordinates. `stopIndex` is its place among the moment's stops,
// the moment's own first stop being 0.
export type MapPoint = {
  momentId: string;
  stopIndex: number;
  lat: number;
  lng: number;
  place?: string;
  startsAt?: number;
  // The zone the stop's time reads in: its moment's.
  tzOffsetMinutes?: number;
  transport?: Transport;
};

// Every stop with coordinates, in time order: by moment, then by stop.
export const mapPoints = (moments: StoryMoment[]): MapPoint[] => {
  return [...moments]
    .sort((a, b) => a.startsAt - b.startsAt)
    .flatMap((moment) =>
      stopsOf(moment).flatMap((stop, stopIndex): MapPoint[] => {
        if (!stop.geo) return [];
        return [
          {
            momentId: moment._id,
            stopIndex,
            lat: stop.geo.lat,
            lng: stop.geo.lng,
            place: stop.place,
            startsAt: stop.startsAt,
            tzOffsetMinutes: moment.tzOffsetMinutes,
            transport: stop.transport,
          },
        ];
      }),
    );
};

// The box around the points as MapLibre takes it, southwest then northeast.
// One point gives a box with no size; no points gives null.
export const bounds = (points: MapPoint[]): [[number, number], [number, number]] | null => {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};
