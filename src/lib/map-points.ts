import type { StoryMoment } from "../components/event/types";
import type { Transport } from "../components/event/transport";
import { stopsOf } from "./story-steps";

export type MapPoint = {
  momentId: string;
  stopIndex: number;
  lat: number;
  lng: number;
  place?: string;
  startsAt?: number;
  tzOffsetMinutes?: number;
  transport?: Transport;
};

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

export const bounds = (
  points: MapPoint[],
): [southwest: [lng: number, lat: number], northeast: [lng: number, lat: number]] | null => {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};
