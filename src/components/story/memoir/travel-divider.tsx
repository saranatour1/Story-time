import { transportOf } from "@/components/event/transport";
import type { StoryStep } from "@/lib/story-steps";

type TravelScene = Extract<StoryStep, { kind: "travel" }>;

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
};

export const TravelDivider = ({
  step,
  leg,
  minutes,
}: {
  step: number;
  leg: TravelScene;
  minutes?: number;
}) => {
  const phrase = transportOf(leg.transport)?.phrase.toLowerCase() ?? "on the way";
  return (
    <div
      id={`step-${step}`}
      data-step={step}
      className="flex items-center gap-3 py-2 text-sm text-stone-600 dark:text-muted-foreground"
    >
      <span aria-hidden className="h-px flex-1 bg-current opacity-25" />
      <p className="text-center">
        <span aria-hidden>→ </span>
        {phrase} to {leg.to}
        {minutes !== undefined && minutes > 0 && ` · ${duration(minutes)} later`}
      </p>
      <span aria-hidden className="h-px flex-1 bg-current opacity-25" />
    </div>
  );
};
