import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { transportOf } from "@/components/event/transport";
import type { EventView, MomentView } from "@/components/event/types";
import { ShareButton } from "@/components/story/share-button";
import { StoryTravelMap } from "@/components/story/story-travel-map";
import { StopFallback } from "@/components/story/story-fallback";
import { Typewriter } from "@/components/story/typewriter";
import { countStops, dateRange } from "@/components/story/title-card";
import { Button } from "@/components/ui/button";
import {
  useInView,
  usePrefersReducedMotion,
  useScrollProgress,
} from "@/components/story/use-story-scroll";
import { buildStorySteps, clampStep, placeLabel, stopsOf, type StoryStep } from "@/lib/story-steps";
import { cn } from "@/lib/utils";

const CameraScene = lazy(() =>
  import("@/components/story/camera-scene").then((m) => ({ default: m.CameraScene })),
);

function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return c.getContext("webgl2") !== null || c.getContext("webgl") !== null;
  } catch {
    return false;
  }
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const BACKDROPS = {
  intro: "/story/sky-coast.png",
  travel: "/story/coastal-drive.png",
  stop: "/story/balcony-sea.png",
  end: "/story/sky-coast.png",
} as const;

// A scrollable story page: words on the left, camera / map on the right.
// Feels like reading a long HTML article with GSAP-style scroll reveals,
// painted travel-poster skies behind each chapter.
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
  const steps = useMemo(() => buildStorySteps(event.title, moments), [event.title, moments]);
  const reduced = usePrefersReducedMotion();
  const [webgl] = useState(detectWebGL);
  const use3d = webgl && !reduced;
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const scrolledOnce = useRef(false);

  const places = useMemo(() => {
    const labels = [event.title];
    for (const s of steps) if (s.kind === "stop") labels.push(placeLabel(s.stop, s.stopIndex));
    return labels;
  }, [steps, event.title]);
  const legs = useMemo(
    () =>
      steps
        .filter((s): s is Extract<StoryStep, { kind: "travel" }> => s.kind === "travel")
        .map((s) => ({ from: s.from, to: s.to, transport: s.transport })),
    [steps],
  );

  useEffect(() => {
    if (scrolledOnce.current) return;
    const i = clampStep(step, steps);
    if (i <= 0) {
      scrolledOnce.current = true;
      return;
    }
    const el = sectionRefs.current[i];
    if (!el) return;
    scrolledOnce.current = true;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [step, steps, reduced]);

  useEffect(() => {
    const nodes = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.step);
          if (Number.isFinite(i)) ratios.set(i, e.intersectionRatio);
        }
        let best = 0;
        let bestR = 0;
        for (const [i, r] of ratios) {
          if (r > bestR) {
            best = i;
            bestR = r;
          }
        }
        if (bestR > 0.35) onStep(best, "replace");
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, [steps, onStep]);

  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const range = dateRange(event, moments);
  const stopCount = countStops(moments);

  return (
    <div className="story-scroll relative min-h-svh bg-[#1a4f8c] text-[#1a2433]">
      <div aria-hidden className="story-grain pointer-events-none fixed inset-0 z-40" />
      <a
        href="#story-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to story
      </a>

      <header className="sticky top-0 z-30 border-b border-white/20 bg-[#1a4f8c]/75 text-white backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-white hover:bg-white/15 hover:text-white">
            <Link to="/e/$id" params={{ id: event._id }}>
              <ArrowLeftIcon className="size-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-tight">{event.title}</p>
            <p className="truncate text-xs text-white/70">
              {moments.length} {moments.length === 1 ? "moment" : "moments"}
              {stopCount > moments.length ? ` · ${stopCount} stops` : ""}
            </p>
          </div>
          <ShareButton event={event} />
        </div>
        <ol aria-label="Story progress" className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 sm:px-6">
          {steps.map((s, i) => (
            <li key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <button
                type="button"
                aria-label={`Go to ${labelFor(s, i)}`}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "block h-full w-full transition-colors",
                  i < step ? "bg-white/80" : i === step ? "bg-[#f0a020]" : "bg-transparent",
                )}
                onClick={() => {
                  sectionRefs.current[i]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                  onStep(i, "push");
                }}
              />
            </li>
          ))}
        </ol>
      </header>

      <main id="story-main">
        {steps.map((scene, i) => {
          const setRef = (el: HTMLElement | null) => {
            sectionRefs.current[i] = el;
          };
          if (scene.kind === "title") {
            return (
              <IntroSection
                key="title"
                refSet={setRef}
                stepIndex={i}
                event={event}
                range={range}
                moments={moments}
                stopCount={stopCount}
                onBegin={() => {
                  sectionRefs.current[1]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                  onStep(1, "push");
                }}
              />
            );
          }
          if (scene.kind === "travel") {
            return (
              <TravelSection
                key={`travel-${i}`}
                refSet={setRef}
                stepIndex={i}
                scene={scene}
                places={places}
                legs={legs}
                reduced={reduced}
              />
            );
          }
          if (scene.kind === "stop") {
            const canEdit =
              !archived && event.role !== "viewer" && (isOwner || scene.authorId === meId);
            return (
              <StopSection
                key={`stop-${scene.momentId}-${scene.stopIndex}`}
                refSet={setRef}
                stepIndex={i}
                scene={scene}
                meId={meId}
                canEdit={canEdit}
                eventId={event._id}
                use3d={use3d}
              />
            );
          }
          return (
            <EndSection
              key="end"
              refSet={setRef}
              stepIndex={i}
              event={event}
              moments={moments}
              stopCount={stopCount}
              onReplay={() => {
                window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                onStep(0, "push");
              }}
            />
          );
        })}
      </main>
    </div>
  );
}

function labelFor(s: StoryStep, i: number) {
  if (s.kind === "title") return "Title";
  if (s.kind === "end") return "The end";
  if (s.kind === "travel") return `Travel to ${s.to}`;
  return placeLabel(s.stop, s.stopIndex) || `Scene ${i + 1}`;
}

function Backdrop({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        src={src}
        alt={alt}
        className="story-backdrop-img absolute inset-0 h-full w-full object-cover object-center"
        loading="lazy"
        decoding="async"
      />
      {/* Soft wash so left-column copy stays readable on busy art. */}
      <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,248,235,0.92)_0%,rgba(255,248,235,0.78)_38%,rgba(26,79,140,0.15)_68%,rgba(26,79,140,0.05)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#1a4f8c]/35 to-transparent" />
    </div>
  );
}

function ChapterShell({
  refSet,
  stepIndex,
  children,
  className,
  backdrop,
}: {
  refSet: (el: HTMLElement | null) => void;
  stepIndex: number;
  children: ReactNode;
  className?: string;
  backdrop: string;
}) {
  return (
    <section
      ref={refSet}
      data-step={stepIndex}
      id={`story-step-${stepIndex}`}
      className={cn("story-chapter relative scroll-mt-24 overflow-hidden py-16 sm:py-24", className)}
    >
      <Backdrop src={backdrop} />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

function IntroSection({
  refSet,
  stepIndex,
  event,
  range,
  moments,
  stopCount,
  onBegin,
}: {
  refSet: (el: HTMLElement | null) => void;
  stepIndex: number;
  event: EventView;
  range: string | null;
  moments: MomentView[];
  stopCount: number;
  onBegin: () => void;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const active = useInView(el);
  return (
    <ChapterShell
      refSet={(node) => {
        setEl(node);
        refSet(node);
      }}
      stepIndex={stepIndex}
      backdrop={BACKDROPS.intro}
      className="min-h-[78svh]"
    >
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="max-w-xl space-y-5 rounded-3xl bg-[#fff8eb]/80 p-6 shadow-[0_20px_60px_-30px_rgba(20,40,80,0.45)] backdrop-blur-sm sm:p-8">
          {range && (
            <p className="text-xs font-semibold tracking-[0.22em] text-[#2a6bb3] uppercase">{range}</p>
          )}
          <Typewriter
            as="h1"
            text={event.title}
            active={active || stepIndex === 0}
            className="font-serif text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-[#1a2433] sm:text-5xl lg:text-6xl"
          />
          {event.description && (
            <p className="text-lg leading-relaxed text-[#3d4a5c] whitespace-pre-wrap">{event.description}</p>
          )}
          <p className="text-sm text-[#5a6a7c]">
            {moments.length} {moments.length === 1 ? "moment" : "moments"}
            {stopCount > moments.length ? ` · ${stopCount} stops` : ""}
          </p>
          {moments.length > 0 ? (
            <Button onClick={onBegin} className="mt-1 bg-[#e85d32] text-white hover:bg-[#d14f28]">
              Start reading
            </Button>
          ) : (
            <p className="text-sm text-[#5a6a7c]">There are no moments to show yet.</p>
          )}
        </div>
        <aside className="hidden min-h-72 lg:block" aria-hidden />
      </div>
    </ChapterShell>
  );
}

function TravelSection({
  refSet,
  stepIndex,
  scene,
  places,
  legs,
  reduced,
}: {
  refSet: (el: HTMLElement | null) => void;
  stepIndex: number;
  scene: Extract<StoryStep, { kind: "travel" }>;
  places: string[];
  legs: { from: string; to: string; transport: string }[];
  reduced: boolean;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const active = useInView(el);
  const progress = useScrollProgress(el, reduced);
  const transport = transportOf(scene.transport);
  const legIndex = Math.max(
    0,
    legs.findIndex((l) => l.from === scene.from && l.to === scene.to && l.transport === scene.transport),
  );

  return (
    <ChapterShell
      refSet={(node) => {
        setEl(node);
        refSet(node);
      }}
      stepIndex={stepIndex}
      backdrop={BACKDROPS.travel}
    >
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-4 rounded-3xl bg-[#fff8eb]/82 p-6 shadow-[0_20px_60px_-30px_rgba(20,40,80,0.4)] backdrop-blur-sm sm:p-7 lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold tracking-[0.22em] text-[#2a6bb3] uppercase">
            {transport ? (
              <>
                <transport.icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
                {transport.phrase}
              </>
            ) : (
              "On the way"
            )}
          </p>
          <Typewriter
            as="h2"
            text={`${scene.from} to ${scene.to}`}
            active={active}
            className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance text-[#1a2433] sm:text-4xl"
          />
          <p className="max-w-md text-base leading-relaxed text-[#3d4a5c]">
            Scroll to draw the leg on the map. Places sit on a stylised atlas made from the names
            in the story — real coordinates come later.
          </p>
        </div>
        <div className="h-[min(58svh,28rem)] w-full overflow-hidden rounded-3xl border border-white/50 shadow-[0_24px_50px_-28px_rgba(20,40,80,0.55)] lg:sticky lg:top-28">
          <StoryTravelMap places={places} legs={legs} current={legIndex} progress={progress} />
        </div>
      </div>
    </ChapterShell>
  );
}

function StopSection({
  refSet,
  stepIndex,
  scene,
  meId,
  canEdit,
  eventId,
  use3d,
}: {
  refSet: (el: HTMLElement | null) => void;
  stepIndex: number;
  scene: Extract<StoryStep, { kind: "stop" }>;
  meId: string | undefined;
  canEdit: boolean;
  eventId: string;
  use3d: boolean;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const active = useInView(el);
  const { stop } = scene;
  const transport = transportOf(stop.transport);
  const author = scene.authorId === meId ? "you" : (scene.authorName ?? "Anonymous");
  const text = stop.blocks.filter((b) => b.type !== "photo" && b.type !== "video");
  const place = placeLabel(stop, scene.stopIndex);

  return (
    <ChapterShell
      refSet={(node) => {
        setEl(node);
        refSet(node);
      }}
      stepIndex={stepIndex}
      backdrop={BACKDROPS.stop}
    >
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-4 rounded-3xl bg-[#fff8eb]/82 p-6 shadow-[0_20px_60px_-30px_rgba(20,40,80,0.4)] backdrop-blur-sm sm:p-7 lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold tracking-[0.22em] text-[#2a6bb3] uppercase">
            {transport && (
              <>
                <transport.icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
                {transport.phrase}
                {" · "}
              </>
            )}
            {stop.startsAt !== undefined && `${when(stop.startsAt)} · `}
            by {author}
          </p>
          <Typewriter
            as="h2"
            text={place}
            active={active}
            className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance text-[#1a2433] sm:text-4xl"
          />
          {scene.labels.length > 0 && scene.stopIndex === 0 && (
            <ul aria-label="Labels" className="flex flex-wrap gap-1.5">
              {scene.labels.map((l) => (
                <li
                  key={l}
                  className="rounded-full border border-[#1a4f8c]/20 bg-white/70 px-2.5 py-0.5 text-xs text-[#3d4a5c]"
                >
                  {l}
                </li>
              ))}
            </ul>
          )}
          {text.length > 0 && (
            <div className="max-w-md space-y-3 text-base leading-relaxed text-[#1a2433]">
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
                    className="block truncate underline decoration-[#e85d32]/60 underline-offset-4 hover:decoration-[#e85d32]"
                  >
                    {b.title ?? b.url}
                  </a>
                ) : null,
              )}
            </div>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" asChild className="border-[#1a4f8c]/25 bg-white/60">
              <Link to="/e/$id" params={{ id: eventId }} search={{ panel: "moment", momentId: scene.momentId }}>
                <PencilIcon /> Edit this moment
              </Link>
            </Button>
          )}
        </div>
        <div className="relative h-[min(62svh,32rem)] w-full overflow-hidden rounded-3xl border border-white/50 bg-[linear-gradient(180deg,#9ec7ef_0%,#5a8fc4_100%)] shadow-[0_24px_50px_-28px_rgba(20,40,80,0.55)] lg:sticky lg:top-28">
          {use3d ? (
            <Suspense fallback={<StopFallback stop={stop} />}>
              <div className="absolute inset-0">
                <CameraScene stop={stop} opening={scene.first && active} />
              </div>
            </Suspense>
          ) : (
            <StopFallback stop={stop} />
          )}
        </div>
      </div>
    </ChapterShell>
  );
}

function EndSection({
  refSet,
  stepIndex,
  event,
  moments,
  stopCount,
  onReplay,
}: {
  refSet: (el: HTMLElement | null) => void;
  stepIndex: number;
  event: EventView;
  moments: MomentView[];
  stopCount: number;
  onReplay: () => void;
}) {
  const photos = moments.reduce(
    (n, m) => n + stopsOf(m).reduce((k, s) => k + s.blocks.filter((b) => b.type === "photo" || b.type === "video").length, 0),
    0,
  );
  return (
    <ChapterShell refSet={refSet} stepIndex={stepIndex} backdrop={BACKDROPS.end} className="min-h-[60svh]">
      <div className="mx-auto max-w-xl space-y-5 rounded-3xl bg-[#fff8eb]/85 p-8 text-center shadow-[0_20px_60px_-30px_rgba(20,40,80,0.45)] backdrop-blur-sm">
        <p className="text-xs font-semibold tracking-[0.22em] text-[#2a6bb3] uppercase">The end</p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance text-[#1a2433] sm:text-4xl">
          {event.title}
        </h2>
        <p className="text-sm text-[#5a6a7c]">
          {moments.length} {moments.length === 1 ? "moment" : "moments"} · {stopCount}{" "}
          {stopCount === 1 ? "stop" : "stops"} · {photos} {photos === 1 ? "picture" : "pictures"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button onClick={onReplay} className="bg-[#e85d32] text-white hover:bg-[#d14f28]">
            Back to the top
          </Button>
          <ShareButton event={event} label={event.role === "owner" ? "Share" : "Copy link"} />
          <Button variant="outline" asChild className="border-[#1a4f8c]/25 bg-white/70">
            <Link to="/e/$id" params={{ id: event._id }}>
              Experience page
            </Link>
          </Button>
        </div>
      </div>
    </ChapterShell>
  );
}
