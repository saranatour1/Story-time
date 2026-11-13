import { Fragment } from "react";
import { StopCard } from "@/components/story/memoir/stop-card";
import { TravelDivider } from "@/components/story/memoir/travel-divider";
import type { StoryDay } from "@/lib/story-days";

export const DaySection = ({
  day,
  numberByStep,
  minutesByStep,
  meId,
  onPlayFilm,
}: {
  day: StoryDay;
  numberByStep: Map<number, number>;
  minutesByStep: Map<number, number>;
  meId?: string;
  onPlayFilm?: (step: number) => void;
}) => {
  return (
    <section aria-label={`Day ${day.index}`} className="space-y-6">
      <h2 className="text-xs tracking-[0.2em] text-orange-800 uppercase dark:text-orange-400">
        Day {day.index} · {day.label}
      </h2>
      {day.stops.map(({ step, scene, leg }) => (
        <Fragment key={step}>
          {leg && <TravelDivider step={step - 1} leg={leg} minutes={minutesByStep.get(step)} />}
          <StopCard
            step={step}
            number={numberByStep.get(step) ?? 0}
            scene={scene}
            meId={meId}
            onPlayFilm={onPlayFilm}
          />
        </Fragment>
      ))}
    </section>
  );
};
