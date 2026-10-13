import { MoveHorizontalIcon } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import { atEdge, clampIndex, nextIndex, picturesOf, tapDelta, tiltOf, wordsOf } from "@/components/story/photo-deck-math";
import type { Stop } from "@/lib/story-steps";
import { isForward, SWIPE_PX, type SwipeDirection, useSwipeSurface } from "@/lib/use-swipe";
import { cn } from "@/lib/utils";

// Remembered once the gesture hint has been shown on this device.
const HINT_KEY = "storytime:deck-hint";
const HINT_MS = 4000;
const TYPEWRITER = { fontFamily: '"Courier New", Courier, monospace' };

const FLIGHT_MS = 280;
const SETTLE_MS = 220;
const REST = "translate3d(0px, 0px, 0px) rotate(0deg)";
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
// Where a card goes when it is pushed off: off the screen on the side it was pushed.
const FLY: Record<SwipeDirection, string> = {
  left: "translate3d(-160%, 0px, 0px) rotate(-16deg)",
  right: "translate3d(160%, 0px, 0px) rotate(16deg)",
  up: "translate3d(0px, -160%, 0px)",
  down: "translate3d(0px, 160%, 0px)",
};

type Pose = { transform: string; opacity: string };
type Flight = { index: number; dir: SwipeDirection };

export type PhotoDeckHandle = {
  // Turns one picture: +1 forward, -1 back. False when already at that end.
  flip(delta: 1 | -1): boolean;
};

// The top card lies square; the two behind it peek out, smaller and tilted.
const restPose = (offset: number, tilt: number, reduced: boolean): string => {
  if (offset < 1) return REST;
  return `translate3d(0px, ${offset * 3}%, 0px) scale(${offset === 1 ? 0.95 : 0.9}) rotate(${reduced ? 0 : tilt}deg)`;
};

// The pictures of a stop as a deck of prints. Swipe, drag, tap or press to turn
// them; past the last or before the first, the story takes the move.
export const PhotoDeck = forwardRef<
  PhotoDeckHandle,
  {
    stop: Stop;
    active: boolean;
    // Set while the story plays: the time each picture stays up.
    autoplayMs: number | null;
    reduced: boolean;
    onEdge(direction: "forward" | "back"): void;
    // Any touch or click on the deck stops autoplay.
    onInteract(): void;
    // The picture now on top, so the scene can wash itself in its colours.
    onIndexChange?(index: number): void;
  }
>(function PhotoDeck({ stop, active, autoplayMs, reduced, onEdge, onInteract: interacted, onIndexChange }, ref) {
  const media = useMemo(() => picturesOf(stop), [stop]);
  const words = useMemo(() => wordsOf(stop), [stop]);
  // A line or two is set large, so a short note fills its page; a long one smaller.
  const written = words.reduce((n, b) => n + b.text.length, 0);
  const wordSize = written < 90 ? "text-2xl sm:text-4xl" : written < 240 ? "text-xl sm:text-3xl" : "text-lg sm:text-2xl";
  const count = media.length;
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  // The picture in view, ahead of the render, so quick presses each count.
  const aim = useRef(0);
  const [index, setIndex] = useState(0);
  // Pictures pushed off the top and still on their way out.
  const [flying, setFlying] = useState<Flight[]>([]);
  // Where the cards were just before a change, and the picture coming back in.
  const before = useRef<Map<number, Pose> | null>(null);
  const entering = useRef<Flight | null>(null);
  const dragging = useRef(false);

  // The first deck of pictures someone meets says how to turn them, once per
  // device, and goes as soon as they touch it.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!active || media.length < 2) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Storage refused (a private window): the hint shows each time, which is fine.
    }
    if (seen) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [active, media.length]);
  const onInteract = () => {
    setHint(false);
    interacted();
  };

  const told = useRef(onIndexChange);
  told.current = onIndexChange;
  useEffect(() => {
    told.current?.(index);
  }, [index]);

  // A stop with fewer pictures keeps the view on one that is still there.
  useEffect(() => {
    const to = clampIndex(aim.current, count);
    if (to === aim.current) return;
    aim.current = to;
    setIndex(to);
  }, [count]);

  // Where every card is now, mid-drag and mid-flight included, so the change
  // animates from what the viewer is seeing.
  const snapshot = () => {
    const poses = new Map<number, Pose>();
    for (const [i, el] of cards.current) {
      const s = getComputedStyle(el);
      poses.set(i, { transform: s.transform, opacity: s.opacity });
    }
    before.current = poses;
  };

  // Moves the picture in view to `to`. A picture pushed forward leaves in `leaves`;
  // one brought back enters from `enters`, the side the finger went.
  const commit = (to: number, leaves?: SwipeDirection, enters?: SwipeDirection) => {
    const from = aim.current;
    snapshot();
    if (leaves) {
      const flight: Flight = { index: from, dir: leaves };
      setFlying((f) => [...f.filter((x) => x.index !== from), flight]);
      window.setTimeout(() => setFlying((f) => f.filter((x) => x !== flight)), FLIGHT_MS + 40);
    }
    if (enters) {
      entering.current = { index: to, dir: enters };
      setFlying((f) => f.filter((x) => x.index !== to));
    }
    aim.current = to;
    setIndex(to);
  };

  // One picture on or back. The sides are where the move came from; keys and
  // taps have none, so they use the swipe's own.
  const flipBy = (delta: 1 | -1, side: SwipeDirection): boolean => {
    if (atEdge(aim.current, count, delta)) return false;
    const to = nextIndex(aim.current, count, delta);
    if (reduced) commit(to);
    else if (delta > 0) commit(to, side);
    else commit(to, undefined, side);
    return true;
  };

  // A drag that doesn't commit: the top card springs back into place.
  const settle = () => {
    dragging.current = false;
    const el = cards.current.get(aim.current);
    if (!el) return;
    const now = getComputedStyle(el);
    el.style.opacity = "";
    el.style.willChange = "";
    el.style.transform = REST;
    if (!reduced) {
      el.animate([{ transform: now.transform, opacity: now.opacity }, { transform: REST, opacity: "1" }], {
        duration: SETTLE_MS,
        easing: SPRING,
      });
    }
  };

  // The top card follows the finger, turning a little and fading toward the
  // distance that commits. At an end it is held back to a third.
  const follow = (dx: number, dy: number) => {
    const el = cards.current.get(aim.current);
    if (!el) return;
    const across = Math.abs(dx) >= Math.abs(dy);
    const side: SwipeDirection = across ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
    const pull = atEdge(aim.current, count, isForward(side) ? 1 : -1) ? 0.33 : 1;
    const x = dx * pull;
    const y = dy * pull;
    el.style.transform = reduced
      ? `translate3d(${x}px, ${y}px, 0)`
      : `translate3d(${x}px, ${y}px, 0) rotate(${x / 20}deg)`;
    el.style.opacity = String(1 - 0.3 * Math.min(1, Math.hypot(dx, dy) / SWIPE_PX));
  };

  useSwipeSurface(root, {
    onDrag({ dx, dy, axis }) {
      if (axis === null) return;
      if (!dragging.current) {
        dragging.current = true;
        onInteract();
        // A card still easing into place starts this drag from where it is.
        const el = cards.current.get(aim.current);
        el?.getAnimations().forEach((a) => a.cancel());
        if (el) el.style.willChange = "transform";
      }
      follow(dx, dy);
    },
    onSwipe(direction) {
      // A flick can end inside one frame, before any drag was reported.
      onInteract();
      dragging.current = false;
      const delta = isForward(direction) ? 1 : -1;
      if (!flipBy(delta, direction)) {
        settle();
        onEdge(delta > 0 ? "forward" : "back");
      }
    },
    onCancel() {
      onInteract();
      settle();
    },
    onTap({ x }) {
      onInteract();
      const box = root.current?.getBoundingClientRect();
      const delta = box ? tapDelta(x - box.left, box.width) : 1;
      if (!flipBy(delta, delta > 0 ? "left" : "right")) onEdge(delta > 0 ? "forward" : "back");
    },
  });

  // While the story plays the pictures turn on their own, up to the last one;
  // the scene's dwell moves the story on from there.
  useEffect(() => {
    if (!active || autoplayMs === null || reduced) return;
    const timer = window.setInterval(() => {
      if (dragging.current || atEdge(aim.current, count, 1)) return;
      commit(nextIndex(aim.current, count, 1), "left");
    }, autoplayMs);
    return () => window.clearInterval(timer);
  }, [active, autoplayMs, reduced, count]);

  // The cards animate from where they were to where they are now: a card that
  // moved glides, a card pushed off flies, a card brought back enters from the
  // side the finger went. Reduced motion only fades the picture that is up.
  useLayoutEffect(() => {
    const start = before.current;
    const enter = entering.current;
    before.current = null;
    entering.current = null;
    if (!start) return;
    for (const [i, el] of cards.current) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = "";
      el.style.willChange = "";
      const now = getComputedStyle(el);
      if (reduced) {
        if (i === aim.current) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
        continue;
      }
      const was = enter && enter.index === i ? { transform: FLY[enter.dir], opacity: "1" } : start.get(i);
      if (!was || (was.transform === now.transform && was.opacity === now.opacity)) continue;
      el.animate([{ transform: was.transform, opacity: was.opacity }, { transform: now.transform, opacity: now.opacity }], {
        duration: FLIGHT_MS,
        easing: "ease-out",
      });
    }
  }, [index]);

  useImperativeHandle(ref, () => ({
    flip: (delta: 1 | -1) => flipBy(delta, delta > 0 ? "left" : "right"),
  }));

  const jump = (to: number) => {
    onInteract();
    if (to !== aim.current) commit(to);
  };

  // The top three are built, plus the card on its way out; the rest wait.
  const shown = [...new Set([index - 1, index, index + 1, index + 2, ...flying.map((f) => f.index)])]
    .filter((i) => i >= 0 && i < count)
    .sort((a, b) => a - b);

  return (
    <div
      ref={root}
      role="group"
      aria-roledescription="carousel"
      aria-label="Pictures at this stop"
      data-no-advance=""
      data-no-swipe=""
      className="relative flex h-full w-full touch-none select-none flex-col items-center justify-center gap-4 p-4"
    >
      {count === 0 ? (
        // No pictures: the words are the picture, typed on the same paper as
        // the title page. The caption below leaves them out.
        <div
          style={TYPEWRITER}
          className="w-full max-w-2xl -rotate-[1deg] rounded-sm bg-[#f3e9d6] bg-[radial-gradient(ellipse_at_50%_40%,transparent_55%,rgb(91_74_58/0.16)_100%)] px-7 py-9 text-stone-900 shadow-[0_30px_60px_-15px_rgb(0_0_0/0.7),0_10px_20px_-10px_rgb(0_0_0/0.5)] [text-shadow:0_0_1px_rgb(28_25_23/0.35)] sm:px-12 sm:py-14"
        >
          {words.length > 0 ? (
            <div className="space-y-4">
              {words.map((b, i) => (
                <p key={i} className={cn("leading-relaxed whitespace-pre-wrap text-pretty sm:leading-relaxed", wordSize)}>
                  {b.type === "feeling" && b.mood ? `${b.mood} ` : ""}
                  {b.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-stone-500">Nothing written down here, just the place.</p>
          )}
        </div>
      ) : (
        <>
          {/* As big as the screen allows: the full width, or the height left
              after the header, the dots and the caption. Upright on a phone
              held upright, where most pictures are taken that way too. */}
          <div
            className="relative aspect-[4/3] w-full max-w-[min(100%,calc((100svh-20rem)*4/3))] portrait:aspect-[3/4] portrait:max-w-[min(100%,calc((100svh-20rem)*3/4))]"
            onDragStart={(e) => e.preventDefault()}
          >
            {shown.map((i) => {
              const offset = i - index;
              const leaving = offset < 0 ? flying.find((f) => f.index === i) : undefined;
              const live = offset >= 0 && offset <= 2;
              const pic = media[i];
              return (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) cards.current.set(i, el);
                    else cards.current.delete(i);
                  }}
                  aria-hidden={offset !== 0}
                  className="absolute inset-0 rounded-sm bg-[#f3e9d6] p-2 pb-8 shadow-[0_30px_60px_-15px_rgb(0_0_0/0.7),0_10px_20px_-10px_rgb(0_0_0/0.5)] sm:p-3 sm:pb-12"
                  style={{
                    transform: leaving ? FLY[leaving.dir] : restPose(offset, tiltOf(i), reduced),
                    zIndex: leaving ? 40 : Math.max(10, 30 - Math.max(offset, 0) * 10),
                    visibility: live || leaving ? "visible" : "hidden",
                  }}
                >
                  <div className="h-full overflow-hidden rounded-sm bg-stone-800 [&>*]:h-full [&>*]:w-full [&>*]:rounded-none [&_img]:pointer-events-none [&_img]:aspect-auto [&_img]:h-full [&_img]:object-cover [&_video]:aspect-auto [&_video]:h-full">
                    {(live || leaving) && pic?.type === "video" && (
                      <div className="h-full w-full">
                        <AuthVideo mediaId={pic.mediaId} label={`Video ${i + 1}`} />
                      </div>
                    )}
                    {(live || leaving) && pic?.type === "photo" && <AuthImage mediaId={pic.mediaId} alt={`Picture ${i + 1}`} variant="full" sizes="100vw" />}
                  </div>
                </div>
              );
            })}
          </div>
          {hint && (
            <p className="pointer-events-none absolute bottom-16 z-50 flex items-center gap-2 rounded-full bg-black/65 px-3.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-1 duration-500 sm:bottom-20">
              <MoveHorizontalIcon aria-hidden className="size-4" />
              <span className="pointer-coarse:hidden">Drag a picture aside, or press ← →</span>
              <span className="hidden pointer-coarse:inline">Swipe the picture to see the next</span>
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            Picture {index + 1} of {count}
          </p>
          {count > 1 && (
            <div className="flex items-center gap-2">
              {media.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show picture ${i + 1} of ${count}`}
                  aria-pressed={i === index}
                  onClick={() => jump(i)}
                  className={cn("size-2.5 rounded-full transition-colors", i === index ? "bg-[#f3e9d6]" : "bg-white/30 hover:bg-white/60")}
                />
              ))}
              <span className="ml-2 text-xs text-white/50">
                {index + 1} / {count}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
