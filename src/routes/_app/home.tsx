import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PlayIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AuthImage } from "@/components/auth-image";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { eventDates } from "@/components/event/event-dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/home")({ component: Home });

type Experience = FunctionReturnType<typeof api.events.listMine>[number];

// The grid's columns follow the space it has (the sidebar may be open).
const GRID = "grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3";

function Home() {
  const events = useQuery(api.events.listMine);
  const createDraft = useMutation(api.events.createDraft);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  useDocumentTitle("Experiences · Story-time");

  async function start() {
    setStarting(true);
    try {
      const id = await createDraft();
      await navigate({ to: "/e/$id", params: { id }, search: { panel: "details" as const } });
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  }

  if (events === undefined) {
    return (
      <div aria-hidden className="@container mx-auto w-full max-w-6xl space-y-8">
        <Skeleton className="h-9 w-48" />
        <div className={GRID}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border">
              <Skeleton className="aspect-[3/2] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center sm:py-24">
        <Snapshots />
        <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight text-balance">
          Your first story starts here
        </h1>
        <p className="text-muted-foreground text-balance">
          Gather the moments from a trip, a weekend or a wedding, then play
          them back with the people who were there.
        </p>
        <Button size="lg" className="mt-2" onClick={() => void start()} disabled={starting}>
          <PlusIcon /> Start an experience
        </Button>
      </div>
    );
  }

  const owned = events.filter((e) => e.role === "owner");
  const shared = events.filter((e) => e.role !== "owner");

  return (
    <div className="@container mx-auto w-full max-w-6xl space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Experiences</h1>
        <Button onClick={() => void start()} disabled={starting}>
          <PlusIcon /> New experience
        </Button>
      </header>
      {/* Headings only when there's more than one kind to tell apart. */}
      {owned.length > 0 && (
        <Section title={shared.length > 0 ? "Yours" : undefined} events={owned} />
      )}
      {shared.length > 0 && <Section title="Shared with you" events={shared} />}
    </div>
  );
}

function Section({ title, events }: { title?: string; events: Experience[] }) {
  return (
    <section className="space-y-4">
      <h2 className={title ? "text-sm font-medium text-muted-foreground" : "sr-only"}>
        {title ?? "Your experiences"}
      </h2>
      <ul className={GRID}>
        {events.map((e) => (
          <ExperienceCard key={e._id} event={e} />
        ))}
      </ul>
    </section>
  );
}

// One experience as a postcard: its cover (or a paper placeholder), then
// its title, dates and size. The title's link covers the whole card; the
// menu and Play sit above it.
function ExperienceCard({ event: e }: { event: Experience }) {
  const dates = eventDates(e);
  const archived = e.status === "archived";
  const draft = e.status === "draft";

  return (
    <li className="group relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs transition-shadow hover:shadow-md">
      <div className={cn("relative aspect-[3/2] overflow-hidden rounded-t-[inherit]", archived && "opacity-60 grayscale")}>
        {e.coverMediaId ? (
          <AuthImage
            mediaId={e.coverMediaId}
            alt=""
            width={480}
            height={320}
            sizes="(min-width: 1024px) 320px, 100vw"
            className="absolute inset-0 aspect-auto size-full rounded-none transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <PaperCover title={e.title} sketch={e.sketch} />
        )}
      </div>
      {(archived || draft) && (
        <Badge variant="secondary" className="absolute top-3 left-3 bg-background/85 backdrop-blur-sm">
          {archived ? "Archived" : "Draft"}
        </Badge>
      )}

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-serif text-lg leading-snug font-semibold text-balance break-words">
          <Link
            to="/e/$id"
            params={{ id: e._id }}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {e.title}
          </Link>
        </h3>
        {dates && <p className="text-sm text-muted-foreground">{dates}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            {e.momentCount} {e.momentCount === 1 ? "moment" : "moments"}
            {e.role !== "owner" && (
              <Badge variant="outline" className="capitalize">
                {e.role}
              </Badge>
            )}
          </p>
          {e.momentCount > 0 && (
            <Button
              size="sm"
              asChild
              className="relative z-10 bg-amber-300 text-stone-950 hover:bg-amber-200 dark:bg-amber-200 dark:hover:bg-amber-100"
            >
              <Link to="/e/$id/story" params={{ id: e._id }} search={{ step: 0 }} aria-label={`Play story: ${e.title}`}>
                <PlayIcon className="fill-current" /> Play story
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="absolute top-2 right-2 z-10 rounded-lg bg-background/85 shadow-xs backdrop-blur-sm">
        <EventActionsMenu event={e} compact />
      </div>
    </li>
  );
}

// No photo yet: cream paper, like the story's title page, with the trip drawn
// on it when its stops are on the map, else the title's first letter.
function PaperCover({ title, sketch }: { title: string; sketch?: Experience["sketch"] }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 grid place-items-center bg-[#f3e9d6] bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.55),transparent_60%)] text-stone-800/70 dark:bg-[#2b251d] dark:bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.06),transparent_60%)] dark:text-amber-100/60"
    >
      <span className="absolute inset-3 rounded-md border border-dashed border-stone-900/15 dark:border-amber-100/15" />
      {sketch && sketch.length >= 2 ? (
        <RouteSketch points={sketch} />
      ) : (
        <span className="font-serif text-6xl font-semibold">{Array.from(title.trim())[0]?.toUpperCase() ?? ""}</span>
      )}
    </div>
  );
}

// The trip's shape, drawn like a pen line across the paper: fitted to the
// card, longitude narrowed by latitude so it isn't stretched, a diamond where
// it set off and a ringed dot where it ended.
const SKETCH_W = 300;
const SKETCH_H = 200;
const SKETCH_PAD = 34;

function RouteSketch({ points }: { points: NonNullable<Experience["sketch"]> }) {
  const k = Math.cos(((points.reduce((n, p) => n + p.lat, 0) / points.length) * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => -p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Fit the longer side; a trip on the spot still gets a little room.
  const span = Math.max(x1 - x0, ((y1 - y0) * SKETCH_W) / SKETCH_H, 1e-4);
  const scale = (SKETCH_W - 2 * SKETCH_PAD) / span;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const at = xs.map((x, i): [number, number] => [
    SKETCH_W / 2 + (x - cx) * scale,
    SKETCH_H / 2 + ((ys[i] ?? 0) - cy) * scale,
  ]);
  // Straight from stop to stop, joints rounded: a smooth curve would loop
  // where a trip doubles back, and this is a route, not a scribble.
  const d = at.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const end = at[at.length - 1]!;
  const start = at[0]!;

  return (
    <svg viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" className="stroke-[#c2410c]/80 dark:stroke-amber-300/80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {at.slice(1, -1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" className="fill-stone-700/70 dark:fill-amber-100/60" />
      ))}
      <rect x={start[0] - 4} y={start[1] - 4} width="8" height="8" transform={`rotate(45 ${start[0]} ${start[1]})`} className="fill-stone-800 dark:fill-amber-100" />
      <circle cx={end[0]} cy={end[1]} r="8" className="fill-[#c2410c]/15 dark:fill-amber-300/20" />
      <circle cx={end[0]} cy={end[1]} r="4" className="fill-[#c2410c] dark:fill-amber-300" />
    </svg>
  );
}

// Two paper snapshots, for the empty state.
function Snapshots() {
  return (
    <div aria-hidden className="relative h-36 w-52">
      <div className="absolute inset-0 rotate-6 rounded-sm bg-[#e9dcc4] shadow-lg dark:bg-[#3a3227]" />
      <div className="absolute inset-0 -rotate-3 rounded-sm bg-[#f3e9d6] p-2.5 pb-8 shadow-xl dark:shadow-black/40">
        <div className="size-full rounded-[2px] bg-linear-to-b from-amber-200 via-orange-200 to-stone-300" />
        <span className="absolute bottom-2 left-3 font-mono text-[11px] text-stone-600">the first moment</span>
      </div>
    </div>
  );
}
