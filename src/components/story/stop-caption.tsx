import { transportOf } from "@/components/event/transport";
import { authorByline } from "@/lib/actors";
import { formatDateTime } from "@/lib/local-time";
import type { StoryStep } from "@/lib/story-steps";

type StopScene = Extract<StoryStep, { kind: "stop" }>;

// On the clock where the stop happened.
const when = (ms: number, offset?: number) =>
  formatDateTime(ms, offset, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The words under a stop: where and when, who, how they got there, and
// anything written down. Pictures are the scene above.
export const StopCaption = ({ scene, meId }: { scene: StopScene; meId: string | undefined }) => {
  const { stop } = scene;
  const transport = transportOf(stop.transport);
  const author = authorByline(scene, meId);
  // A stop with no pictures shows its words on paper above, so here only its links.
  const pictured = stop.blocks.some((b) => b.type === "photo" || b.type === "video");
  const text = stop.blocks.filter((b) =>
    pictured ? b.type !== "photo" && b.type !== "video" : b.type === "link",
  );
  // A stop without a place is headed by its time, or its number in the story.
  const time = stop.startsAt === undefined ? undefined : when(stop.startsAt, scene.tzOffsetMinutes);
  const heading = stop.place || time || scene.place;
  const showTime = time !== undefined && heading !== time;

  return (
    <section
      aria-label="About this stop"
      className="relative z-10 mx-auto w-full max-w-3xl space-y-2 px-4 pb-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-700 sm:px-6"
    >
      <p className="text-xs tracking-[0.2em] text-amber-200/80 uppercase sm:tracking-[0.25em]">
        {transport && (
          <>
            <transport.icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
            {transport.phrase}
            {(showTime || author) && " · "}
          </>
        )}
        {showTime && (author ? `${time} · ` : time)}
        {author && `by ${author}`}
      </p>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{heading}</h2>
      {scene.labels.length > 0 && scene.stopIndex === 0 && (
        <ul aria-label="Labels" className="flex flex-wrap justify-center gap-1.5">
          {scene.labels.map((l) => (
            <li key={l} className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/70">
              {l}
            </li>
          ))}
        </ul>
      )}
      {text.length > 0 && (
        <div className="mx-auto max-h-24 max-w-xl space-y-1.5 overflow-y-auto text-sm text-white/80 sm:max-h-32" data-no-advance="">
          {text.map((b, i) =>
            b.type === "note" ? (
              <p key={i} className="whitespace-pre-wrap">
                {b.text}
              </p>
            ) : b.type === "feeling" ? (
              <p key={i} className="whitespace-pre-wrap italic">
                {b.mood} {b.text}
              </p>
            ) : b.type === "link" ? (
              <a
                key={i}
                href={b.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate underline underline-offset-4"
              >
                {b.title ?? b.url}
              </a>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
};
