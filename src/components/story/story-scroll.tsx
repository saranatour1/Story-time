import { Link } from "@tanstack/react-router";
import { PlayIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import { useReducedMotion } from "@/components/landing/paper";
import { Cover } from "@/components/story/memoir/cover";
import { DaySection } from "@/components/story/memoir/day-section";
import { MemoirEnd } from "@/components/story/memoir/end";
import { type MapLeg, type MapStop, StickyMap } from "@/components/story/memoir/sticky-map";
import { ShareButton } from "@/components/story/share-button";
import { Button } from "@/components/ui/button";
import { mapPoints } from "@/lib/map-points";
import { storyDays, travelMinutes } from "@/lib/story-days";
import { buildStorySteps, clampStep } from "@/lib/story-steps";
import { usePrefetchMedia } from "@/lib/use-media-url";
import { isForward, useSwipeSurface } from "@/lib/use-swipe";
import { cn } from "@/lib/utils";

const STRIP_BOTTOM = 56 + 224 + 16;
const GLIDE_MS = 1200;
const readingLine = (): number => {
  const third = window.innerHeight / 3;
  return window.matchMedia("(min-width: 1024px)").matches ? third : Math.max(third, STRIP_BOTTOM);
};

const revealStep = (step: number, behavior: ScrollBehavior) => {
  if (step === 0) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const el = document.getElementById(`step-${step}`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - readingLine();
  window.scrollTo({ top, behavior });
};

const stepFrom = (cards: number[], aimed: number, delta: 1 | -1): number | undefined => {
  if (delta > 0) return cards.find((i) => i > aimed);
  return [...cards].reverse().find((i) => i < aimed) ?? 0;
};

export const StoryScroll = ({
  event,
  moments,
  meId,
  step,
  onStep,
  onPlayFilm,
}: {
  event: StoryEvent;
  moments: StoryMoment[];
  meId?: string;
  step: number;
  onStep: (step: number) => void;
  // Absent on a share link whose owner switched the film off.
  onPlayFilm?: (step: number) => void;
}) => {
  const reduced = useReducedMotion();
  const steps = useMemo(() => buildStorySteps(event.title, moments), [event.title, moments]);
  const days = useMemo(() => storyDays(steps), [steps]);
  const minutes = useMemo(() => travelMinutes(steps), [steps]);
  const numbers = useMemo(() => {
    const n = new Map<number, number>();
    steps.forEach((s, i) => {
      if (s.kind === "stop") n.set(i, n.size + 1);
    });
    return n;
  }, [steps]);
  const cards = useMemo(
    () => steps.flatMap((s, i) => (s.kind === "stop" || s.kind === "end" ? [i] : [])),
    [steps],
  );
  const located = useMemo<MapStop[]>(() => {
    const at = new Map(
      steps.flatMap((s, i) =>
        s.kind === "stop" ? [[`${s.momentId}:${s.stopIndex}`, i] as const] : [],
      ),
    );
    return mapPoints(moments).flatMap((p): MapStop[] => {
      const i = at.get(`${p.momentId}:${p.stopIndex}`);
      const s = i === undefined ? undefined : steps[i];
      if (i === undefined || s?.kind !== "stop") return [];
      return [
        {
          step: i,
          number: numbers.get(i) ?? 0,
          name: s.place,
          transport: p.transport,
          lng: p.lng,
          lat: p.lat,
        },
      ];
    });
  }, [moments, steps, numbers]);

  const [scene, setScene] = useState(() => clampStep(step, steps));
  const shown = useRef(scene);
  const aim = useRef(scene);
  const page = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  const focus = useMemo(() => {
    const s = steps[scene];
    if (s?.kind === "stop") return scene;
    return s?.kind === "travel" ? scene + 1 : null;
  }, [steps, scene]);
  const leg = useMemo<MapLeg | undefined>(() => {
    const before = focus === null ? undefined : steps[focus - 1];
    if (before?.kind !== "travel" || !before.fromGeo || !before.toGeo) return undefined;
    return { from: before.fromGeo, to: before.toGeo, transport: before.transport };
  }, [steps, focus]);

  const next = steps.find((s, i) => i > scene && s.kind === "stop");
  usePrefetchMedia(
    next?.kind === "stop"
      ? next.stop.blocks.flatMap((b) => ("mediaId" in b ? [b.mediaId] : []))
      : [],
  );

  useLayoutEffect(() => {
    if (scene > 0) revealStep(scene, "auto");
  }, []);

  const landing = useRef<number | null>(null);
  const glide = useCallback(
    (target: number) => {
      aim.current = target;
      landing.current = target;
      revealStep(target, reduced ? "auto" : "smooth");
      window.setTimeout(() => {
        if (landing.current === target) landing.current = null;
      }, GLIDE_MS);
    },
    [reduced],
  );

  const [windowResizes, setWindowResizes] = useState(0);
  useEffect(() => {
    const onResize = () => setWindowResizes((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const anchors = [...root.querySelectorAll<HTMLElement>("[data-step]")];
    const stepOf = new Map<Element, number>(
      anchors.map((el): [Element, number] => [el, Number(el.dataset.step)]),
    );
    const line = Math.round(readingLine());
    const below = Math.max(0, Math.round(window.innerHeight - line - 2));
    const crossing = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = stepOf.get(e.target);
          if (s === undefined) continue;
          if (e.isIntersecting) crossing.add(s);
          else crossing.delete(s);
        }
        if (crossing.size === 0) return;
        const here = Math.max(...crossing);
        if (landing.current !== null) {
          if (here !== landing.current) return;
          landing.current = null;
        }
        aim.current = here;
        if (here === shown.current) return;
        shown.current = here;
        setScene(here);
        onStep(here);
      },
      { rootMargin: `-${line}px 0px -${below}px 0px` },
    );
    for (const el of anchors) io.observe(el);
    return () => io.disconnect();
  }, [steps, onStep, windowResizes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      const target =
        e.key === "ArrowDown"
          ? stepFrom(cards, aim.current, 1)
          : e.key === "ArrowUp"
            ? stepFrom(cards, aim.current, -1)
            : undefined;
      if (target === undefined || target === aim.current) return;
      e.preventDefault();
      glide(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, glide]);

  useSwipeSurface(
    page,
    {
      onSwipe(direction) {
        const target = stepFrom(cards, aim.current, isForward(direction) ? 1 : -1);
        if (target === undefined || target === aim.current) return;
        glide(target);
      },
    },
    { axes: "x", touchOnly: true },
  );

  useEffect(() => {
    const update = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current)
        bar.current.style.transform = `scaleX(${room > 0 ? Math.min(1, window.scrollY / room) : 0})`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const hasMap = located.length > 0;
  const stopCount = numbers.size;
  const shareLabel = event.role === "owner" ? "Share" : "Copy link";

  return (
    <div className="min-h-svh bg-[#f3e9d6] text-stone-900 dark:bg-background dark:text-foreground">
      <header className="sticky top-0 z-30 border-b border-[#5b4a3a]/15 bg-[#f3e9d6]/95 backdrop-blur-sm dark:bg-background/95">
        <div
          ref={bar}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#c2410c]"
          style={{ transform: "scaleX(0)" }}
        />
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
          <p className="min-w-0 flex-1 truncate font-serif text-sm font-semibold">{event.title}</p>
          {onPlayFilm && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-label="Play as film"
              onClick={() => onPlayFilm(scene)}
            >
              <PlayIcon /> <span className="hidden sm:inline">Play as film</span>
            </Button>
          )}
          <ShareButton event={event} label={shareLabel} />
          <Button variant="ghost" size="icon" asChild aria-label="Close story">
            {event.role === undefined ? (
              <Link to="/">
                <XIcon />
              </Link>
            ) : (
              <Link to="/e/$id" params={{ id: event._id }}>
                <XIcon />
              </Link>
            )}
          </Button>
        </div>
      </header>

      <main ref={page} className="mx-auto w-full max-w-7xl touch-pan-y px-4 pb-24 sm:px-6 lg:px-8">
        <div
          className={cn(
            "pt-8 sm:pt-12",
            hasMap && "lg:grid lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] lg:gap-x-12",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-2xl",
              hasMap && "lg:col-start-1 lg:row-start-1 lg:mx-0",
            )}
          >
            <Cover
              event={event}
              moments={moments}
              days={days.length}
              stops={stopCount}
              onPlayFilm={onPlayFilm && (() => onPlayFilm(0))}
            />
          </div>
          {hasMap && (
            <StickyMap
              className="sticky top-14 z-10 mx-auto mt-8 h-56 w-full max-w-2xl lg:col-start-2 lg:row-span-full lg:top-20 lg:mx-0 lg:mt-12 lg:h-[calc(100svh-6rem)] lg:max-w-none lg:self-start"
              stops={located}
              focus={focus}
              leg={leg}
              reduced={reduced}
              onPick={glide}
            />
          )}
          <div
            className={cn(
              "mx-auto mt-16 w-full max-w-2xl space-y-20",
              hasMap && "lg:col-start-1 lg:row-start-2 lg:mx-0",
            )}
          >
            {days.map((day) => (
              <DaySection
                key={day.index}
                day={day}
                numberByStep={numbers}
                minutesByStep={minutes}
                meId={meId}
                onPlayFilm={onPlayFilm}
              />
            ))}
            <MemoirEnd
              event={event}
              moments={moments}
              step={steps.length - 1}
              onReplay={() => glide(0)}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
