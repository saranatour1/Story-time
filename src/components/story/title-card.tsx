import { PlayIcon } from "lucide-react";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { stopsOf } from "@/lib/story-steps";

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// The date range: what the owner set, or the span of the moments.
export function dateRange(event: EventView, moments: MomentView[]): string | null {
  const times = moments.map((m) => m.startsAt);
  const from = event.startsAt ?? (times.length ? Math.min(...times) : undefined);
  const to = event.endsAt ?? (times.length ? Math.max(...times) : undefined);
  if (from === undefined) return null;
  if (to === undefined || day(to) === day(from)) return day(from);
  return `${day(from)} – ${day(to)}`;
}

export function countStops(moments: MomentView[]) {
  return moments.reduce((n, m) => n + stopsOf(m).length, 0);
}

// The opening card: the experience's title and description, like a film's
// title sequence.
export function TitleCard({
  event,
  moments,
  onPlay,
}: {
  event: EventView;
  moments: MomentView[];
  onPlay: () => void;
}) {
  const range = dateRange(event, moments);
  const stops = countStops(moments);
  return (
    <section
      aria-label="Title"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center animate-in fade-in zoom-in-95 duration-1000"
    >
      {range && <p className="text-sm tracking-[0.3em] text-amber-200/80 uppercase">{range}</p>}
      <h1 className="max-w-3xl font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
        {event.title}
      </h1>
      {event.description && (
        <p className="max-w-xl text-base whitespace-pre-wrap text-white/70 sm:text-lg">{event.description}</p>
      )}
      <p className="text-sm text-white/50">
        {moments.length} {moments.length === 1 ? "moment" : "moments"}
        {stops > moments.length && ` · ${stops} stops`}
      </p>
      {moments.length > 0 ? (
        <Button size="lg" onClick={onPlay} className="mt-4 bg-amber-200 text-stone-900 hover:bg-amber-100">
          <PlayIcon /> Play
        </Button>
      ) : (
        <p className="mt-4 text-sm text-white/50">There are no moments to show yet.</p>
      )}
    </section>
  );
}
