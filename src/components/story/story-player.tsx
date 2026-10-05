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
import { TitleCard } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import { legDuration } from "@/lib/story-map";
import { buildStorySteps, clampStep, placeLabel, type StoryStep } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

// three.js is only loaded when a stop scene renders in 3D.
const CameraScene = lazy(() =>
  import("@/components/story/camera-scene").then((m) => ({ default: m.CameraScene })),
);

const SWIPE_PX = 50;

// How long autoplay lingers on each scene.
function sceneMs(step: StoryStep): number | null {
  switch (step.kind) {
    case "title":
      return 4000;
    case "stop":
      return 6500;
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
// click, keys or swipes to move between them.
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
  const [playing, setPlaying] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const [webgl] = useState(detectWebGL);
  const use3d = webgl && !reduced;
  const touchX = useRef<number | null>(null);

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
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
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
    const ms = sceneMs(scene);
    if (ms === null) return;
    const t = setTimeout(() => go(1, "replace"), reduced ? Math.min(ms, 3000) : ms);
    return () => clearTimeout(t);
  }, [playing, scene, go, reduced]);

  // Clicking the stage moves the story: left third back, the rest forward.
  // Buttons and links inside it keep their own behaviour.
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest("button, a, input, textarea, select, video, [data-no-advance]")) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    go(e.clientX - left < width / 3 ? -1 : 1);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    if (end - start > SWIPE_PX) go(-1);
    else if (start - end > SWIPE_PX) go(1);
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
          <TitleCard
            event={event}
            moments={moments}
            onPlay={() => {
              setPlaying(true);
              go(1);
            }}
          />
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
            onReplay={() => onStep(0, "push")}
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
        <p className="text-xs text-white/50">Click, swipe or use the arrow keys</p>
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
