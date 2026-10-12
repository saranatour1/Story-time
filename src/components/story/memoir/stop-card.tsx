import { PlayIcon } from "lucide-react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import { transportOf } from "@/components/event/transport";
import { Near } from "@/components/story/memoir/near";
import { Button } from "@/components/ui/button";
import { authorByline } from "@/lib/actors";
import { formatTime } from "@/lib/local-time";
import type { StoryStep } from "@/lib/story-steps";

type StopScene = Extract<StoryStep, { kind: "stop" }>;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One stop as a card: where and when, how they got there, what they wrote and
// the pictures they took. Its step is its id, for the map and the keys; the
// round button starts the film from here.
export const StopCard = ({
  step,
  number,
  scene,
  meId,
  onPlayFilm,
}: {
  step: number;
  number: number;
  scene: StopScene;
  // The reader, so their own stop says "by you".
  meId?: string;
  onPlayFilm: (step: number) => void;
}) => {
  const { stop } = scene;
  // On the clock where the stop happened.
  const at = stop.startsAt === undefined ? undefined : formatTime(stop.startsAt, scene.tzOffsetMinutes);
  // Headed by the place; without one, by its time, else its number in the story.
  const heading = stop.place || at || scene.place;
  const transport = transportOf(stop.transport);
  const diary = stop.blocks.flatMap((b) => (b.type === "note" || b.type === "feeling" ? [b] : []));
  const media = stop.blocks.flatMap((b) => (b.type === "photo" || b.type === "video" ? [b] : []));
  const links = stop.blocks.flatMap((b) => (b.type === "link" ? [b] : []));
  const photos = media.filter((b) => b.type === "photo").length;
  const videos = media.length - photos;
  // A shared story leaves its authors out, so there is no "by" line on one.
  const author = authorByline(scene, meId);
  const meta = [
    at !== heading ? at : undefined,
    transport?.phrase,
    author && `by ${author}`,
    photos > 0 ? count(photos, "photo") : undefined,
    videos > 0 ? count(videos, "video") : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      id={`step-${step}`}
      data-step={step}
      aria-label={`Stop ${number}: ${heading}`}
      className="rounded-2xl bg-white/60 p-5 shadow-sm ring-1 ring-[#5b4a3a]/10 sm:p-7 dark:bg-card dark:ring-white/10"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 border-l-2 border-[#c2410c] pl-4">
          <h3 className="font-serif text-2xl leading-tight font-semibold text-balance sm:text-3xl">{heading}</h3>
          {meta && <p className="mt-1.5 text-xs tracking-wide text-stone-600 dark:text-muted-foreground">{meta}</p>}
        </div>
        <Button
          variant="outline"
          size="icon-lg"
          className="shrink-0 rounded-full border-[#c2410c]/40 text-[#c2410c] hover:bg-[#c2410c]/10 hover:text-[#c2410c]"
          aria-label="Play from here"
          title="Play from here"
          onClick={() => onPlayFilm(step)}
        >
          <PlayIcon />
        </Button>
      </div>

      {scene.labels.length > 0 && scene.stopIndex === 0 && (
        <ul aria-label="Labels" className="mt-4 flex flex-wrap gap-1.5">
          {scene.labels.map((l) => (
            <li key={l} className="rounded-full border border-[#5b4a3a]/25 px-2.5 py-0.5 text-xs text-stone-700 dark:text-muted-foreground">
              {l}
            </li>
          ))}
        </ul>
      )}

      {diary.length > 0 && (
        <div className="mt-5 space-y-3 font-serif text-base leading-relaxed sm:text-lg">
          {diary.map((b, i) =>
            b.type === "feeling" ? (
              <p key={i} className="whitespace-pre-wrap italic">
                {b.mood} {b.text}
              </p>
            ) : (
              <p key={i} className="whitespace-pre-wrap">
                {b.text}
              </p>
            ),
          )}
        </div>
      )}

      {media.length > 0 && (
        <ul aria-label="Pictures" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((b, i) =>
            b.type === "video" ? (
              <li key={i} className="col-span-full">
                <Near placeholder={<div className="aspect-video animate-pulse rounded-md bg-muted" />}>
                  <AuthVideo mediaId={b.mediaId} label={`Video at ${heading}`} />
                </Near>
              </li>
            ) : (
              <li key={i}>
                <Near placeholder={<div className="aspect-square animate-pulse rounded-lg bg-muted" />}>
                  <AuthImage mediaId={b.mediaId} alt={`Photo at ${heading}`} className="aspect-square rounded-lg" />
                </Near>
              </li>
            ),
          )}
        </ul>
      )}

      {links.length > 0 && (
        <ul aria-label="Links" className="mt-5 space-y-1 text-sm">
          {links.map((b, i) => (
            <li key={i}>
              <a
                href={b.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate underline underline-offset-4"
              >
                {b.title ?? b.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};
