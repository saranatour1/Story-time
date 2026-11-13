import type { MomentView, StoryMoment } from "@/components/event/types";

export type Transport = NonNullable<MomentView["transport"]>;
export type Stop = MomentView["stops"][number];
export type LatLng = NonNullable<Stop["geo"]>;

export type StoryStep =
  | { kind: "title" }
  | {
      kind: "travel";
      from: string;
      to: string;
      fromGeo?: LatLng;
      toGeo?: LatLng;
      transport: Transport;
      momentId: string;
      stopIndex: number;
    }
  | {
      kind: "stop";
      momentId: string;
      stopIndex: number;
      stop: Stop;
      tzOffsetMinutes?: number;
      first: boolean;
      authorId?: string;
      authorName?: string;
      authorAgent?: string;
      labels: string[];
      place: string;
    }
  | { kind: "end" };

export const stopsOf = (m: StoryMoment): Stop[] => {
  return [
    { startsAt: m.startsAt, place: m.place, geo: m.geo, transport: m.transport, blocks: m.blocks },
    ...m.stops,
  ];
};

export const placeLabel = (stop: Stop, n: number) => stop.place || `Stop ${n + 1}`;

export const buildStorySteps = (title: string, moments: StoryMoment[]): StoryStep[] => {
  const steps: StoryStep[] = [{ kind: "title" }];
  const ordered = [...moments].sort((a, b) => a.startsAt - b.startsAt);
  let previousPlace = title;
  let previousGeo: LatLng | undefined;
  let n = 0;
  for (const moment of ordered) {
    const stops = stopsOf(moment);
    stops.forEach((stop, stopIndex) => {
      const to = placeLabel(stop, n);
      if (stop.transport !== undefined) {
        steps.push({
          kind: "travel",
          from: previousPlace,
          to,
          fromGeo: previousGeo,
          toGeo: stop.geo,
          transport: stop.transport,
          momentId: moment._id,
          stopIndex,
        });
      }
      steps.push({
        kind: "stop",
        momentId: moment._id,
        stopIndex,
        stop,
        tzOffsetMinutes: moment.tzOffsetMinutes,
        first: n === 0,
        authorId: moment.authorId,
        authorName: moment.authorName,
        authorAgent: moment.authorAgent,
        labels: moment.labels,
        place: to,
      });
      n++;
      previousPlace = to;
      previousGeo = stop.geo;
    });
  }
  steps.push({ kind: "end" });
  return steps;
};

export const clampStep = (step: number, steps: StoryStep[]) =>
  Math.min(Math.max(Math.trunc(step) || 0, 0), Math.max(steps.length - 1, 0));

export const stepForMoment = (steps: StoryStep[], momentId: string): number => {
  const i = steps.findIndex((s) => s.kind === "stop" && s.momentId === momentId);
  return i === -1 ? 0 : i;
};
