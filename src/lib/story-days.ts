import { formatDay } from "./local-time";
import { dayKey } from "./photo-groups";
import type { StoryStep } from "./story-steps";

type StopScene = Extract<StoryStep, { kind: "stop" }>;
type TravelScene = Extract<StoryStep, { kind: "travel" }>;

export type StoryDay = {
  // The day the stops happened on, in the zone they happened in: YYYY-MM-DD.
  day: string;
  // The same date to read: "Wed, Feb 5".
  label: string;
  // Days are numbered from 1 across the whole story.
  index: number;
  stops: Array<{ step: number; scene: StopScene; leg?: TravelScene }>;
};

const DATE = { weekday: "short", month: "short", day: "numeric" } as const;

// The stops of the story, in order, grouped into the days they happened on.
// Stops on the same day share a section; a stop with no time of its own takes
// its moment's day. A stop's leg is the travel scene right before it.
export const storyDays = (steps: StoryStep[]): StoryDay[] => {
  const days: StoryDay[] = [];
  // When the moment being walked began: its first stop's time.
  let momentAt = 0;
  steps.forEach((scene, step) => {
    if (scene.kind !== "stop") return;
    if (scene.stopIndex === 0) momentAt = scene.stop.startsAt ?? momentAt;
    const at = scene.stop.startsAt ?? momentAt;
    const before = steps[step - 1];
    const entry = { step, scene, leg: before?.kind === "travel" ? before : undefined };
    // A stop's zone is its moment's, so its day is the one it had there.
    const day = dayKey(at, scene.tzOffsetMinutes);
    const last = days.at(-1);
    if (last?.day === day) last.stops.push(entry);
    else days.push({ day, label: formatDay(at, scene.tzOffsetMinutes, DATE), index: days.length + 1, stops: [entry] });
  });
  return days;
};

// Minutes from the previous stop's time to each stop that has a leg into it,
// keyed by that stop's step. Only where both times are known.
export const travelMinutes = (steps: StoryStep[]): Map<number, number> => {
  const minutes = new Map<number, number>();
  let previous: number | undefined;
  steps.forEach((scene, step) => {
    if (scene.kind !== "stop") return;
    const at = scene.stop.startsAt;
    const arrived = steps[step - 1]?.kind === "travel";
    if (arrived && previous !== undefined && at !== undefined && at > previous) {
      const m = Math.round((at - previous) / 60_000);
      if (m > 0) minutes.set(step, m);
    }
    previous = at;
  });
  return minutes;
};
