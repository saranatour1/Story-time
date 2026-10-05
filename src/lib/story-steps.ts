import type { MomentView } from "@/components/event/types";

export type Transport = NonNullable<MomentView["transport"]>;
export type Stop = MomentView["stops"][number];

export type StoryStep =
  | { kind: "title" }
  | {
      kind: "travel";
      from: string;
      to: string;
      transport: Transport;
      momentId: string;
      stopIndex: number;
    }
  | {
      kind: "stop";
      momentId: string;
      stopIndex: number;
      stop: Stop;
      // The first stop of the whole story: the camera opens on it.
      first: boolean;
      authorId: string;
      authorName?: string;
      labels: string[];
    }
  | { kind: "end" };

// The first stop lives on the moment itself; later ones in `stops`.
export function stopsOf(m: MomentView): Stop[] {
  return [{ startsAt: m.startsAt, place: m.place, transport: m.transport, blocks: m.blocks }, ...m.stops];
}

export const placeLabel = (stop: Stop, index: number) => stop.place ?? `Stop ${index + 1}`;

// Turns an experience and its moments into the ordered scenes of the story.
// Moments play in time order. Before any stop that records how they got
// there, a travel scene runs from the previous place (or the title, for the
// very first) to this one.
export function buildStorySteps(title: string, moments: MomentView[]): StoryStep[] {
  const steps: StoryStep[] = [{ kind: "title" }];
  const ordered = [...moments].sort((a, b) => a.startsAt - b.startsAt);
  let previousPlace = title;
  let first = true;
  for (const moment of ordered) {
    const stops = stopsOf(moment);
    stops.forEach((stop, stopIndex) => {
      const to = placeLabel(stop, stopIndex);
      if (stop.transport !== undefined) {
        steps.push({
          kind: "travel",
          from: previousPlace,
          to,
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
        first,
        authorId: moment.authorId,
        authorName: moment.authorName,
        labels: moment.labels,
      });
      first = false;
      previousPlace = to;
    });
  }
  steps.push({ kind: "end" });
  return steps;
}

export const clampStep = (step: number, steps: StoryStep[]) =>
  Math.min(Math.max(Math.trunc(step) || 0, 0), Math.max(steps.length - 1, 0));

// Index of the first scene showing this moment, for deep links from the page.
export function stepForMoment(steps: StoryStep[], momentId: string): number {
  const i = steps.findIndex((s) => s.kind === "stop" && s.momentId === momentId);
  return i === -1 ? 0 : i;
}
