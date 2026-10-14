import { Fragment } from "react";
import { StopCard } from "@/components/story/memoir/stop-card";
import { TravelDivider } from "@/components/story/memoir/travel-divider";
import type { StoryDay } from "@/lib/story-days";

// One day of the story: its eyebrow, then its stops in order, each preceded by
// the leg that brought them there.
export const DaySection = ({
  day,
  numbers,
  minutes,
  meId,
  onPlayFilm,
}: {
  day: StoryDay;
  // Each stop's number through the story, by its step.
  numbers: Map<number, number>;
  // Minutes travelled into each stop, by its step.
  minutes: Map<number, number>;
  meId?: string;
  onPlayFilm: (step: number) => void;
}) => {
  return (
    <section aria-label={`Day ${day.index}`} className="space-y-6">
      <h2 className="text-xs tracking-[0.2em] text-orange-800 uppercase dark:text-orange-400">
        Day {day.index} · {day.label}
      </h2>
      {day.stops.map(({ step, scene, leg }) => (
        <Fragment key={step}>
          {leg && <TravelDivider step={step - 1} leg={leg} minutes={minutes.get(step)} />}
          <StopCard
            step={step}
            number={numbers.get(step) ?? 0}
            scene={scene}
            meId={meId}
            onPlayFilm={onPlayFilm}
          />
        </Fragment>
      ))}
    </section>
  );
};
