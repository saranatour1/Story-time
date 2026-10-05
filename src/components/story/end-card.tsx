import { Link } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import type { EventView, MomentView } from "@/components/event/types";
import { ShareButton } from "@/components/story/share-button";
import { countStops } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { stopsOf } from "@/lib/story-steps";

// The closing card: a few numbers, then replay, share or go back.
export function EndCard({
  event,
  moments,
  onReplay,
}: {
  event: EventView;
  moments: MomentView[];
  onReplay: () => void;
}) {
  const stops = countStops(moments);
  const photos = moments.reduce(
    (n, m) => n + stopsOf(m).reduce((k, s) => k + s.blocks.filter((b) => b.type === "photo" || b.type === "video").length, 0),
    0,
  );
  return (
    <section
      aria-label="The end"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center animate-in fade-in duration-1000"
    >
      <p className="text-sm tracking-[0.3em] text-amber-200/80 uppercase">The end</p>
      <h2 className="max-w-2xl font-serif text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{event.title}</h2>
      <p className="text-sm text-white/60">
        {moments.length} {moments.length === 1 ? "moment" : "moments"} · {stops} {stops === 1 ? "stop" : "stops"} ·{" "}
        {photos} {photos === 1 ? "picture" : "pictures"}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onReplay} className="bg-amber-200 text-stone-900 hover:bg-amber-100">
          <RotateCcwIcon /> Replay
        </Button>
        <ShareButton event={event} label={event.role === "owner" ? "Share" : "Copy link"} />
        <Button variant="ghost" asChild className="text-white hover:bg-white/10 hover:text-white">
          <Link to="/e/$id" params={{ id: event._id }}>
            Back to the experience
          </Link>
        </Button>
      </div>
    </section>
  );
}
