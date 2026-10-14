import { ChevronLeftIcon, ChevronRightIcon, MoveHorizontalIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useReducedMotion } from "@/components/landing/paper";
import { DrawnPhoto, PHOTOS } from "@/components/landing/photos";
import { isForward, useSwipeSurface } from "@/lib/use-swipe";
import { cn } from "@/lib/utils";

// Story mode's deck of prints, to try on the page: drag or swipe the top print
// away for the next one, the other way to bring the last one back, or use the
// buttons. Only sideways, so the page still scrolls under a finger.

const LEAVE_MS = 260;
// The prints under the top one, as they lie in the pile.
const PILE = [
  "rotate-[5deg] translate-y-3 scale-[0.94]",
  "-rotate-[4deg] translate-y-1.5 scale-[0.97]",
];

export const SwipeDeck = () => {
  const reduced = useReducedMotion();
  const surface = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  // How the top print arrived, so one coming back slides in from the side.
  const [arrived, setArrived] = useState<"back" | null>(null);
  const count = PHOTOS.length;

  const next = (way: "left" | "right" = "left") => {
    if (leaving) return;
    setArrived(null);
    if (reduced) {
      setTop((t) => (t + 1) % count);
      return;
    }
    setLeaving(way);
    setTimeout(() => {
      setTop((t) => (t + 1) % count);
      setLeaving(null);
      setDrag(0);
    }, LEAVE_MS);
  };
  const back = () => {
    if (leaving) return;
    setDrag(0);
    setArrived("back");
    setTop((t) => (t - 1 + count) % count);
  };

  useSwipeSurface(
    surface,
    {
      onDrag: ({ dx, axis }) => {
        if (axis === "x") setDrag(dx);
      },
      onCancel: () => setDrag(0),
      onSwipe: (direction) => (isForward(direction) ? next("left") : back()),
      onTap: () => next(),
    },
    { axes: "x" },
  );

  const photo = PHOTOS[top]!;
  const topStyle = leaving
    ? {
        transform: `translateX(${leaving === "left" ? "-130%" : "130%"}) rotate(${leaving === "left" ? -16 : 16}deg)`,
        opacity: 0,
      }
    : drag
      ? { transform: `translateX(${drag}px) rotate(${drag * 0.05}deg)`, transition: "none" }
      : undefined;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={surface}
        aria-hidden
        className="relative grid w-[min(100%,19rem)] cursor-grab touch-pan-y place-items-center select-none active:cursor-grabbing"
      >
        {[2, 1].map((depth) => {
          const p = PHOTOS[(top + depth) % count]!;
          return (
            <div
              key={`${p.kind}-${depth}`}
              className={cn(
                "col-start-1 row-start-1 w-full rounded-[3px] bg-[#f4efe4] p-[3.5%] pb-[11%] shadow-xl transition-transform duration-300",
                PILE[2 - depth],
              )}
            >
              <DrawnPhoto kind={p.kind} className="aspect-[4/3] w-full" />
            </div>
          );
        })}
        <div
          key={photo.kind}
          style={topStyle}
          className={cn(
            "col-start-1 row-start-1 w-full -rotate-1 rounded-[3px] bg-[#fbf7ef] p-[3.5%] pb-[11%] shadow-2xl transition-[transform,opacity] duration-[260ms] ease-out",
            arrived === "back" &&
              !reduced &&
              "animate-in fade-in-0 slide-in-from-right-12 duration-300",
          )}
        >
          <DrawnPhoto kind={photo.kind} className="aspect-[4/3] w-full" />
          <p className="mt-[5%] text-center font-serif text-sm text-stone-600 italic">
            {photo.place}
          </p>
        </div>
      </div>

      <p
        className="mt-7 max-w-[30ch] text-center text-sm leading-relaxed text-stone-300"
        aria-live="polite"
      >
        <span className="font-serif text-base text-stone-50">{photo.place}</span>
        <span className="text-stone-500"> · {photo.time}</span>
        <br />
        {photo.note}
      </p>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Previous print"
          className="grid size-9 place-items-center rounded-full border border-white/15 text-stone-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-stone-500 uppercase">
          <MoveHorizontalIcon aria-hidden className="size-3.5" />
          {top + 1} / {count}
        </span>
        <button
          type="button"
          onClick={() => next()}
          aria-label="Next print"
          className="grid size-9 place-items-center rounded-full border border-white/15 text-stone-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
};
