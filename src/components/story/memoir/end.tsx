import { RotateCcwIcon } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import { contactSheet } from "@/components/story/end-card";
import { Near } from "@/components/story/memoir/near";
import { ShareButton } from "@/components/story/share-button";
import { countStops } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { stopsOf } from "@/lib/story-steps";

// The end of the memoir: the trip's pictures laid out like prints, a few
// numbers, then replay or share.
export const MemoirEnd = ({
  event,
  moments,
  step,
  onReplay,
}: {
  event: StoryEvent;
  moments: StoryMoment[];
  // Its step, so the keys and a link to the end can reach it.
  step: number;
  onReplay: () => void;
}) => {
  const stops = countStops(moments);
  const photos = moments.reduce(
    (n, m) => n + stopsOf(m).reduce((k, s) => k + s.blocks.filter((b) => b.type === "photo" || b.type === "video").length, 0),
    0,
  );
  const prints = contactSheet(moments);
  return (
    <section
      id={`step-${step}`}
      data-step={step}
      aria-label="The end"
      className="border-t border-[#5b4a3a]/20 pt-12 text-center"
    >
      {prints.length > 0 && (
        <ul aria-label="Pictures from the experience" className="flex flex-wrap justify-center gap-3">
          {prints.map((mediaId, i) => (
            <li
              key={i}
              className="w-20 bg-white p-1 pb-3 shadow-md sm:w-24 sm:pb-4"
              style={{ rotate: `${((i * 37) % 11) - 5}deg` }}
            >
              <Near placeholder={<div className="aspect-square animate-pulse bg-stone-200" />}>
                <AuthImage mediaId={mediaId} alt="" className="aspect-square rounded-none" />
              </Near>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-10 text-xs tracking-[0.3em] text-orange-800 uppercase dark:text-orange-400">The end</p>
      <h2 className="mx-auto mt-3 max-w-2xl font-serif text-3xl font-semibold text-balance sm:text-4xl">{event.title}</h2>
      <p className="mt-3 text-sm text-stone-600 dark:text-muted-foreground">
        {moments.length} {moments.length === 1 ? "moment" : "moments"} · {stops} {stops === 1 ? "stop" : "stops"} · {photos}{" "}
        {photos === 1 ? "picture" : "pictures"}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" onClick={onReplay}>
          <RotateCcwIcon /> Replay
        </Button>
        <ShareButton event={event} label={event.role === "owner" ? "Share" : "Copy link"} />
      </div>
    </section>
  );
};
