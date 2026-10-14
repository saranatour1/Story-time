import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import { EndCard } from "@/components/story/end-card";
import { PhotoDeck, type PhotoDeckHandle } from "@/components/story/photo-deck";
import { SceneBackdrop } from "@/components/story/scene-backdrop";
import { dwellMs, PHOTO_MS, picturesOf } from "@/components/story/photo-deck-math";
import { ShareButton } from "@/components/story/share-button";
import { StopCaption } from "@/components/story/stop-caption";
import { TitleCard, typingMs } from "@/components/story/title-card";
import { TravelScene } from "@/components/story/travel-scene";
import { Button } from "@/components/ui/button";
import { legDuration } from "@/lib/story-map";
import { buildStorySteps, clampStep, type LatLng, type StoryStep } from "@/lib/story-steps";
import { usePrefetchMedia } from "@/lib/use-media-url";
import { isForward, useSwipeSurface } from "@/lib/use-swipe";
import { cn } from "@/lib/utils";

const NEXT_KEYS = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
const PREV_KEYS = ["ArrowLeft", "ArrowUp", "PageUp"];
// The scroll position is checked against these visible fractions of a scene.
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

// How long autoplay lingers on each scene; the title waits for its typing.
const sceneMs = (step: StoryStep, titleTypingMs: number): number | null => {
  switch (step.kind) {
    case "title":
      return titleTypingMs + 2500;
    case "stop":
      return dwellMs(picturesOf(step.stop).length);
    case "travel":
      return legDuration(step.transport) * 1000 + 1500;
    case "end":
      return null;
  }
};

// Asks for a context and gives it straight back: browsers allow only a few.
const detectWebGL = (): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The story as a page that scrolls: every scene a screen tall, snapping
// lightly into place, progress on top. Scroll, click, keys or the arrows move
// through it. Autoplay (on unless the viewer prefers reduced motion) scrolls
// on by itself until the viewer scrolls or presses a key.
export const StoryPlayer = ({
  event,
  moments,
  meId,
  step,
  onStep,
  onClose,
}: {
  event: StoryEvent;
  moments: StoryMoment[];
  meId: string | undefined;
  // Where the link pointed; read once, then the scroll leads.
  step: number;
  // Keeps ?step= on the scene in view, replacing history rather than adding.
  onStep: (step: number) => void;
  // Closing hands back the scene in view; without it, the story is left.
  onClose?: (step: number) => void;
}) => {
  const navigate = useNavigate();
  const steps = useMemo(() => buildStorySteps(event.title, moments), [event.title, moments]);
  // The scene most in view.
  const [current, setCurrent] = useState(() => clampStep(step, steps));
  const scene = steps[current] ?? steps[0]!;
  const [reduced] = useState(prefersReducedMotion);
  // Nothing plays on the end card, however the story got there.
  const [playing, setPlaying] = useState(() => !reduced && scene.kind !== "end");
  useEffect(() => {
    if (scene.kind === "end") setPlaying(false);
  }, [scene.kind]);
  const [webgl] = useState(detectWebGL);
  const stage = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The picture on top at each stop, so its scene wears that picture's colours.
  const [photoAt, setPhotoAt] = useState<Record<number, number>>({});
  // Full screen, where the browser offers it (not iPhone Safari, for one).
  const [canFull] = useState(() => typeof document !== "undefined" && document.fullscreenEnabled);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.current?.requestFullscreen().catch(() => {});
  }, []);
  // The photo deck of the stop in view, for the arrow keys.
  const deck = useRef<PhotoDeckHandle>(null);
  const sections = useRef<Array<HTMLElement | null>>([]);
  const fill = useRef<HTMLSpanElement>(null);
  const titleTypingMs = useMemo(
    () => (reduced ? 0 : typingMs(event, moments)),
    [reduced, event, moments],
  );

  // The scene last aimed at, ahead of the scroll, so quick presses each count.
  const at = useRef(current);
  const go = useCallback(
    (delta: number) => {
      const next = clampStep(at.current + delta, steps);
      if (next === at.current) return;
      at.current = next;
      // Neighbours glide; longer jumps cut, so the scenes between don't load.
      sections.current[next]?.scrollIntoView({
        behavior: reduced || Math.abs(delta) > 1 ? "auto" : "smooth",
      });
    },
    [steps, reduced],
  );
  const restart = (play: boolean) => {
    setPlaying(play);
    go(-at.current);
  };
  // A shared story's viewers may have no experience to go back to.
  const shared = event.role === undefined;
  const exit = useCallback(() => {
    if (onClose) {
      onClose(at.current);
      return;
    }
    void (shared ? navigate({ to: "/" }) : navigate({ to: "/e/$id", params: { id: event._id } }));
  }, [navigate, event._id, shared, onClose]);

  // A deep link opens on its scene.
  useLayoutEffect(() => {
    sections.current[at.current]?.scrollIntoView();
  }, []);

  // The scene most in view is the current one, and the URL follows it.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const seen = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.intersectionRect.height);
        let best = -1;
        let most = 0;
        sections.current.forEach((el, i) => {
          const h = (el && seen.get(el)) ?? 0;
          if (h > most) [best, most] = [i, h];
        });
        if (best === -1) return;
        at.current = best;
        setCurrent(best);
      },
      { root, threshold: THRESHOLDS },
    );
    for (const el of sections.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [steps.length]);
  useEffect(() => {
    onStep(current);
  }, [current, onStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      // Enter and Space press the focused button or link, not the page.
      if (
        (e.key === " " || e.key === "Enter") &&
        el?.closest("button, a, [role=button], select, summary")
      )
        return;
      const delta = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0;
      if (delta) {
        e.preventDefault();
        setPlaying(false);
        // Left and right turn a stop's pictures before they turn the scenes.
        const sideways = e.key === "ArrowLeft" || e.key === "ArrowRight";
        if (!(sideways && deck.current?.flip(delta))) go(delta);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFull();
      } else if (e.key === "Escape") {
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, exit, toggleFull]);

  // Autoplay moves on when the scene's time is up, its progress segment
  // filling meanwhile. Pausing freezes the fill; playing again starts both
  // over together.
  useEffect(() => {
    if (!playing) return;
    const ms = sceneMs(scene, titleTypingMs);
    if (ms === null) return;
    const dwell = reduced ? Math.min(ms, 3000) : ms;
    const t = setTimeout(() => go(1), dwell);
    const el = fill.current;
    el?.getAnimations().forEach((a) => a.cancel());
    const a = reduced
      ? undefined
      : el?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], dwell);
    return () => {
      clearTimeout(t);
      a?.pause();
    };
  }, [playing, scene, go, reduced, titleTypingMs]);
  // Once the viewer scrolls, they're the one turning the pages.
  const takeOver = () => setPlaying(false);

  // A sideways swipe turns the story: left on, right back. A swipe that starts
  // on a stop's pictures is the deck's, which marks itself out of this one.
  useSwipeSurface(
    scroller,
    {
      onSwipe(direction) {
        setPlaying(false);
        go(isForward(direction) ? 1 : -1);
      },
    },
    { axes: "x" },
  );

  // The next stop's pictures load while this scene shows.
  const upcoming = steps.slice(current + 1).find((s) => s.kind === "stop");
  usePrefetchMedia(
    upcoming?.kind === "stop"
      ? upcoming.stop.blocks.flatMap((b) => ("mediaId" in b ? [b.mediaId] : []))
      : [],
  );

  // Clicking a scene moves the story: left third back, the rest forward.
  // Buttons and links inside it keep their own behaviour.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (
      target.closest(
        "button, a, input, textarea, select, summary, details, video, [data-no-advance]",
      )
    )
      return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    go(e.clientX - left < width / 3 ? -1 : 1);
  };

  // The title page is paper, so the chrome over it is ink; elsewhere it is light.
  const onPaper = scene.kind === "title";
  const chrome = onPaper
    ? "text-stone-900 hover:bg-stone-900/10 hover:text-stone-900"
    : "text-white hover:bg-white/10 hover:text-white";

  const archived = event.status === "archived";
  // Editing needs an account here, so a shared story has no editors.
  const canEdit =
    scene.kind === "stop" &&
    !archived &&
    (event.role === "owner" ||
      (event.role === "contributor" && meId !== undefined && scene.authorId === meId));
  const legs = useMemo(() => steps.filter((s) => s.kind === "travel"), [steps]);
  // Places in story order. The experience's own name is one only when the
  // first leg sets off from it.
  const places = useMemo(
    () =>
      steps.flatMap((s) => (s.kind === "travel" ? [s.from] : s.kind === "stop" ? [s.place] : [])),
    [steps],
  );
  // The places picked on a map, a repeated name keeping its first spot.
  const located = useMemo(() => {
    const spots = new Map<string, LatLng>();
    for (const s of steps)
      if (s.kind === "stop" && s.stop.geo && !spots.has(s.place)) spots.set(s.place, s.stop.geo);
    return [...spots].map(([name, geo]) => ({ name, geo }));
  }, [steps]);

  // Only the scenes around the one in view are built: their maps keep WebGL
  // (never more than three contexts), so scrolling back shows the same map
  // rather than swapping to the light version; the rest are empty screens
  // until scrolled near.
  const sceneAt = (s: StoryStep, i: number) => {
    const active = i === current;
    const near = Math.abs(i - current) <= 1;
    switch (s.kind) {
      case "title":
        return <TitleCard event={event} moments={moments} animate={!reduced} />;
      case "end":
        // Built on arrival, so its prints are dealt out in view.
        return (
          active && <EndCard event={event} moments={moments} onReplay={() => restart(!reduced)} />
        );
      case "travel":
        if (!near) return null;
        return (
          <TravelScene
            leg={s}
            legs={legs}
            places={places}
            located={located}
            animate={!reduced}
            active={active}
            idle={i > current}
            webgl={webgl}
          />
        );
      case "stop": {
        const pic = picturesOf(s.stop)[photoAt[i] ?? 0];
        return (
          <>
            {near && pic?.type === "photo" && (
              <SceneBackdrop key={pic.mediaId} mediaId={pic.mediaId} />
            )}
            <div className="relative min-h-0 flex-1">
              {near && (
                <PhotoDeck
                  ref={active ? deck : undefined}
                  stop={s.stop}
                  active={active}
                  autoplayMs={playing && !reduced ? PHOTO_MS : null}
                  reduced={reduced}
                  onEdge={(d) => go(d === "forward" ? 1 : -1)}
                  onInteract={takeOver}
                  onIndexChange={(n) => setPhotoAt((p) => (p[i] === n ? p : { ...p, [i]: n }))}
                />
              )}
            </div>
            <StopCaption scene={s} meId={meId} />
          </>
        );
      }
    }
  };

  return (
    <div
      ref={stage}
      className="relative h-svh w-full overflow-hidden bg-[#141210] text-stone-100 select-none"
      style={{ colorScheme: "dark" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,228,180,0.08),transparent_60%)]"
      />

      <div
        ref={scroller}
        role="presentation"
        className="relative h-full cursor-pointer touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onClick={onStageClick}
        onWheel={takeOver}
        onTouchMove={takeOver}
      >
        {steps.map((s, i) => (
          <section
            key={i}
            ref={(el) => {
              sections.current[i] = el;
            }}
            aria-label={`Scene ${i + 1} of ${steps.length}`}
            className={cn(
              "relative flex snap-start flex-col pt-12 pb-12",
              // A long description or a pile of prints may run past one screen.
              s.kind === "title" || s.kind === "end" ? "min-h-svh" : "h-svh",
            )}
          >
            {sceneAt(s, i)}
          </section>
        ))}
      </div>

      {/* Over the scenes, letting the scroll through between its buttons. On the
          paper title page the chrome turns to ink, elsewhere it is light. */}
      <header
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-1 px-3 pt-3 transition-colors duration-500 sm:gap-1.5 sm:px-4 [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
          onPaper ? "text-stone-900" : "text-white",
        )}
      >
        <ol
          aria-label="Progress"
          className={cn("mr-2 flex min-w-0 flex-1", steps.length > 30 ? "gap-px" : "gap-1")}
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className={cn(
                "h-1 flex-1 overflow-hidden rounded-full transition-colors duration-500",
                onPaper ? "bg-stone-900/15" : "bg-white/15",
              )}
            >
              <button
                type="button"
                aria-label={`Go to scene ${i + 1}`}
                aria-current={i === current ? "step" : undefined}
                onClick={() => go(i - at.current)}
                className={cn(
                  "block h-full w-full transition-colors",
                  i < current ? (onPaper ? "bg-stone-900/55" : "bg-white/70") : "bg-transparent",
                )}
                title={s.kind}
              >
                {i === current && (
                  <span
                    ref={fill}
                    className={cn(
                      "block h-full origin-left",
                      onPaper ? "bg-[#c2410c]" : "bg-amber-200",
                    )}
                  />
                )}
              </button>
            </li>
          ))}
        </ol>
        <span
          className={cn(
            "mr-1 hidden text-xs tabular-nums sm:inline",
            onPaper ? "text-stone-600" : "text-white/60",
          )}
        >
          {current + 1} / {steps.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={playing ? "Pause" : "Autoplay"}
          aria-pressed={playing}
          onClick={() => (scene.kind === "end" ? restart(true) : setPlaying((p) => !p))}
          className={chrome}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        {canEdit && scene.kind === "stop" && (
          <Button variant="ghost" size="icon" asChild className={chrome}>
            <Link
              to="/e/$id"
              params={{ id: event._id }}
              search={{ panel: "moment", momentId: scene.momentId, editId: scene.momentId }}
              aria-label="Edit this moment"
            >
              <PencilIcon />
            </Link>
          </Button>
        )}
        <ShareButton event={event} className={chrome} />
        {canFull && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={full ? "Leave full screen" : "Full screen"}
            title={full ? "Leave full screen (F)" : "Full screen (F)"}
            aria-pressed={full}
            onClick={toggleFull}
            className={chrome}
          >
            {full ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close story"
          onClick={exit}
          className={chrome}
        >
          <XIcon />
        </Button>
      </header>

      <nav
        aria-label="Scenes"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-3 pb-3 transition-colors duration-500 [&_button]:pointer-events-auto",
          onPaper ? "text-stone-900" : "text-white",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous scene"
          disabled={current === 0}
          onClick={() => go(-1)}
          className={cn(chrome, "disabled:opacity-30")}
        >
          <ChevronUpIcon />
        </Button>
        {current === 0 && (
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs",
              onPaper ? "text-stone-600" : "text-white/50",
            )}
          >
            <span className="pointer-coarse:hidden">Scroll, or use the arrow keys</span>
            <span className="hidden pointer-coarse:inline">Swipe up</span>
            <ChevronDownIcon aria-hidden className="size-3.5 animate-bounce" />
          </p>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next scene"
          disabled={current === steps.length - 1}
          onClick={() => go(1)}
          className={cn(chrome, "disabled:opacity-30")}
        >
          <ChevronDownIcon />
        </Button>
      </nav>
    </div>
  );
};
