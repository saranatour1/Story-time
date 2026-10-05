import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventView, MomentView } from "@/components/event/types";
import { EndCard } from "@/components/story/end-card";
import { MapScene } from "@/components/story/map-scene";
import { ShareButton } from "@/components/story/share-button";
import { StopCaption } from "@/components/story/stop-caption";
import { StopFallback } from "@/components/story/story-fallback";
import { TitleCard, typingMs } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { legDuration } from "@/lib/story-map";
import { buildStorySteps, clampStep, placeLabel, type StoryStep } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

// three.js is only loaded when a stop scene renders in 3D.
const CameraScene = lazy(() =>
  import("@/components/story/camera-scene").then((m) => ({ default: m.CameraScene })),
);

const SWIPE_PX = 50;
// Wheel travel that counts as a scroll to the next scene.
const WHEEL_PX = 50;
// Wheel events closer together than this belong to one scroll gesture.
const WHEEL_GESTURE_MS = 250;

// How long autoplay lingers on each scene; the title waits for its typing.
function sceneMs(step: StoryStep, titleTypingMs: number): number | null {
  switch (step.kind) {
    case "title":
      return titleTypingMs + 2500;
    case "stop":
      return 5000;
    case "travel":
      return legDuration(step.transport) * 1000 + 1500;
    case "end":
      return null;
  }
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return c.getContext("webgl2") !== null || c.getContext("webgl") !== null;
  } catch {
    return false;
  }
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The story as a full-window player: one scene at a time, progress on top,
// click, scroll, keys or swipes to move between them. Autoplay is on unless
// the viewer prefers reduced motion.
export function StoryPlayer({
  event,
  moments,
  meId,
  step,
  onStep,
}: {
  event: EventView;
  moments: MomentView[];
  meId: string | undefined;
  step: number;
  onStep: (step: number, mode: "push" | "replace") => void;
}) {
  const navigate = useNavigate();
  const steps = useMemo(() => buildStorySteps(event.title, moments), [event.title, moments]);
  const current = clampStep(step, steps);
  const scene = steps[current] ?? steps[0]!;
  const [reduced] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(!reduced);
  const [webgl] = useState(detectWebGL);
  const use3d = webgl && !reduced;
  const touch = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ sum: 0, last: 0, done: false });
  const titleTypingMs = useMemo(() => (reduced ? 0 : typingMs(event, moments)), [reduced, event, moments]);

  const go = useCallback(
    (delta: number, mode: "push" | "replace" = "push") => {
      const next = clampStep(current + delta, steps);
      if (next !== current) onStep(next, mode);
      if (next === steps.length - 1) setPlaying(false);
    },
    [current, steps, onStep],
  );
  const exit = useCallback(
    () => void navigate({ to: "/e/$id", params: { id: event._id } }),
    [navigate, event._id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, exit]);

  useEffect(() => {
    if (!playing) return;
    const ms = sceneMs(scene, titleTypingMs);
    if (ms === null) return;
    const t = setTimeout(() => go(1, "replace"), reduced ? Math.min(ms, 3000) : ms);
    return () => clearTimeout(t);
  }, [playing, scene, go, reduced, titleTypingMs]);

  // Clicking the stage moves the story: left third back, the rest forward.
  // Buttons and links inside it keep their own behaviour.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest("button, a, input, textarea, select, video, [data-no-advance]")) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    go(e.clientX - left < width / 3 ? -1 : 1);
  };
  // Swiping left or up moves on; right or down goes back.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const end = e.changedTouches[0];
    if (!start || !end) return;
    const dx = start.x - end.clientX;
    const dy = start.y - end.clientY;
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (d > SWIPE_PX) go(1);
    else if (d < -SWIPE_PX) go(-1);
  };
  // One scene per scroll gesture, however long a trackpad's momentum runs.
  // A scrollable box under the pointer (a stop's long notes) keeps the wheel.
  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as Element).closest("[data-scroll]")) return;
    const w = wheel.current;
    if (e.timeStamp - w.last > WHEEL_GESTURE_MS) {
      w.sum = 0;
      w.done = false;
    }
    w.last = e.timeStamp;
    if (w.done) return;
    w.sum += e.deltaY;
    if (Math.abs(w.sum) < WHEEL_PX) return;
    w.done = true;
    go(w.sum > 0 ? 1 : -1);
  };

  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const canEdit =
    scene.kind === "stop" && !archived && event.role !== "viewer" && (isOwner || scene.authorId === meId);
  const legs = useMemo(() => steps.filter((s) => s.kind === "travel"), [steps]);
  const places = useMemo(() => {
    const labels = [event.title];
    for (const s of steps) if (s.kind === "stop") labels.push(placeLabel(s.stop, s.stopIndex));
    return labels;
  }, [steps, event.title]);

  return (
    <div
      className="relative flex h-svh w-full select-none flex-col overflow-hidden bg-[#141210] text-stone-100"
      style={{ colorScheme: "dark" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,228,180,0.08),transparent_60%)]" />

      <header className="relative z-20 flex items-center gap-3 px-4 pt-3">
        <ol aria-label="Progress" className="flex flex-1 gap-1">
          {steps.map((s, i) => (
            <li key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <button
                type="button"
                aria-label={`Go to scene ${i + 1}`}
                aria-current={i === current ? "step" : undefined}
                onClick={() => onStep(i, "push")}
                className={cn(
                  "block h-full w-full transition-colors",
                  i < current ? "bg-white/70" : i === current ? "bg-amber-200" : "bg-transparent",
                )}
                title={s.kind}
              />
            </li>
          ))}
        </ol>
        <span className="hidden text-xs text-white/60 tabular-nums sm:inline">
          {current + 1} / {steps.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={playing ? "Pause" : "Autoplay"}
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        {canEdit && scene.kind === "stop" && (
          <Button variant="ghost" size="icon" asChild className="text-white hover:bg-white/10 hover:text-white">
            <Link
              to="/e/$id"
              params={{ id: event._id }}
              search={{ panel: "moment", momentId: scene.momentId }}
              aria-label="Edit this moment"
            >
              <PencilIcon />
            </Link>
          </Button>
        )}
        <ShareButton event={event} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close story"
          onClick={exit}
          className="text-white hover:bg-white/10 hover:text-white"
        >
          <XIcon />
        </Button>
      </header>

      <div
        role="presentation"
        className="relative z-10 flex min-h-0 flex-1 cursor-pointer flex-col"
        onClick={onStageClick}
      >
        {scene.kind === "title" && (
          <TitleCard event={event} moments={moments} animate={!reduced} />
        )}
        {scene.kind === "travel" && (
          <MapScene
            key={current}
            places={places}
            legs={legs}
            current={legs.indexOf(scene)}
            animate={!reduced}
          />
        )}
        {scene.kind === "stop" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1" data-no-advance={use3d ? "" : undefined}>
              {use3d ? (
                <Suspense fallback={<StopFallback key={current} stop={scene.stop} />}>
                  <CameraScene
                    key={scene.momentId}
                    stop={scene.stop}
                    opening={scene.first}
                    onBack={() => go(-1)}
                    onNext={() => go(1)}
                  />
                </Suspense>
              ) : (
                <StopFallback key={current} stop={scene.stop} />
              )}
            </div>
            <StopCaption scene={scene} meId={meId} />
          </div>
        )}
        {scene.kind === "end" && (
          <EndCard
            event={event}
            moments={moments}
            onReplay={() => {
              setPlaying(!reduced);
              onStep(0, "push");
            }}
          />
        )}
      </div>

      <nav aria-label="Scenes" className="relative z-20 flex items-center justify-between px-3 pb-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous scene"
          disabled={current === 0}
          onClick={() => go(-1)}
          className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <ChevronLeftIcon />
        </Button>
        <p className="text-xs text-white/50">Scroll, click, swipe or use the arrow keys</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next scene"
          disabled={current === steps.length - 1}
          onClick={() => go(1)}
          className="text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    </div>
  );
}
