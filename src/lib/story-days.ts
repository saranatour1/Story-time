import { formatDay } from "./local-time";
import { dayKey } from "./photo-groups";
import type { StoryStep } from "./story-steps";

type StopScene = Extract<StoryStep, { kind: "stop" }>;
type TravelScene = Extract<StoryStep, { kind: "travel" }>;

export type StoryDay = {
  day: string;
  label: string;
  index: number;
  stops: Array<{ step: number; scene: StopScene; leg?: TravelScene }>;
};

const DATE = { weekday: "short", month: "short", day: "numeric" } as const;

export const storyDays = (steps: StoryStep[]): StoryDay[] => {
  const days: StoryDay[] = [];
  let momentAt = 0;
  steps.forEach((scene, step) => {
    if (scene.kind !== "stop") return;
    if (scene.stopIndex === 0) momentAt = scene.stop.startsAt ?? momentAt;
    const at = scene.stop.startsAt ?? momentAt;
    const before = steps[step - 1];
    const entry = { step, scene, leg: before?.kind === "travel" ? before : undefined };
    const day = dayKey(at, scene.tzOffsetMinutes);
    const last = days.at(-1);
    if (last?.day === day) last.stops.push(entry);
    else
      days.push({
        day,
        label: formatDay(at, scene.tzOffsetMinutes, DATE),
        index: days.length + 1,
        stops: [entry],
      });
  });
  return days;
};

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
