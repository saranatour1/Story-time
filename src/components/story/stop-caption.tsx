import { transportOf } from "@/components/event/transport";
import type { StoryStep } from "@/lib/story-steps";
import { placeLabel } from "@/lib/story-steps";

type StopScene = Extract<StoryStep, { kind: "stop" }>;

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The words under a stop: where and when, who, how they got there, and
// anything written down. Pictures are the scene above.
export function StopCaption({ scene, meId }: { scene: StopScene; meId: string | undefined }) {
  const { stop } = scene;
  const transport = transportOf(stop.transport);
  const author = scene.authorId === meId ? "you" : (scene.authorName ?? "Anonymous");
  const text = stop.blocks.filter((b) => b.type !== "photo" && b.type !== "video");

  return (
    <section
      aria-label="About this stop"
      className="relative z-10 mx-auto w-full max-w-3xl space-y-2 px-6 pb-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-700"
    >
      <p className="text-xs tracking-[0.25em] text-amber-200/80 uppercase">
        {transport && (
          <>
            <transport.icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
            {transport.phrase} ·{" "}
          </>
        )}
        {stop.startsAt !== undefined && `${when(stop.startsAt)} · `}by {author}
      </p>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {placeLabel(stop, scene.stopIndex)}
      </h2>
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
        <div className="mx-auto max-h-32 max-w-xl space-y-1.5 overflow-y-auto text-sm text-white/80" data-no-advance="">
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
}
