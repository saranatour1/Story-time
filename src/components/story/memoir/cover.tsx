import { PlayIcon } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import { dateRange } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { stopsOf } from "@/lib/story-steps";

// The story's first photo in time order: the picture on the cover.
const firstPhoto = (moments: StoryMoment[]): string | undefined => {
  const blocks = [...moments].sort((a, b) => a.startsAt - b.startsAt).flatMap((m) => stopsOf(m).flatMap((s) => s.blocks));
  const photo = blocks.find((b) => b.type === "photo");
  return photo?.type === "photo" ? photo.mediaId : undefined;
};

// The top of the memoir: what the story is, when, and a first picture. The
// film is one tap away from here, too.
export const Cover = ({
  event,
  moments,
  days,
  stops,
  onPlayFilm,
}: {
  event: StoryEvent;
  moments: StoryMoment[];
  days: number;
  stops: number;
  onPlayFilm: () => void;
}) => {
  const range = dateRange(event, moments);
  const photo = firstPhoto(moments);
  const counts =
    moments.length === 0
      ? "No moments yet."
      : `${moments.length} ${moments.length === 1 ? "moment" : "moments"} · ${days} ${days === 1 ? "day" : "days"} · ${stops} ${stops === 1 ? "stop" : "stops"}`;

  return (
    <section id="step-0" data-step={0} aria-labelledby="story-title">
      <p className="text-xs tracking-[0.2em] text-orange-800 uppercase dark:text-orange-400">
        {range ? `A story · ${range}` : "A story"}
      </p>
      <h1 id="story-title" className="mt-3 font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {event.title}
      </h1>
      {event.description && (
        <p className="mt-4 font-serif text-lg leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-muted-foreground">
          {event.description}
        </p>
      )}
      {photo && <AuthImage mediaId={photo} alt="" variant="full" sizes="(min-width: 768px) 640px, 100vw" className="mt-8 aspect-[3/2] w-full rounded-2xl object-cover" />}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button size="lg" className="rounded-full bg-[#c2410c] px-5 text-white hover:bg-[#c2410c]/90" onClick={onPlayFilm}>
          <PlayIcon /> Play as film
        </Button>
        <p className="text-sm text-stone-600 dark:text-muted-foreground">{counts}</p>
      </div>
    </section>
  );
};
