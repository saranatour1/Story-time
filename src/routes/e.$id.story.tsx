import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { PlayIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { pageForPlay, playSurface } from "@/components/journal/play";
import { Reader } from "@/components/journal/reader";
import { SignInScreen } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { buildStorySteps, stepForMoment } from "@/lib/story-steps";

const StoryPlayer = lazy(() => import("@/components/story/story-player").then((m) => ({ default: m.StoryPlayer })));
const StoryScroll = lazy(() => import("@/components/story/story-scroll").then((m) => ({ default: m.StoryScroll })));

const search = z.object({
  // The scene in view, kept up to date as the film plays or the story scrolls.
  step: z.number().int().min(0).default(0).catch(0),
  // Which page of the book is open.
  page: z.number().int().min(0).default(0).catch(0),
  // Start at this moment, then drop out of the URL.
  momentId: z.string().optional().catch(undefined),
  // The book, the film, or the story when a page clipped the note.
  mode: z.enum(["read", "film", "words"]).default("read").catch("read"),
  // Closing the film returns here when it was opened from the full note.
  back: z.enum(["words"]).optional().catch(undefined),
});

// Outside `_app`, so there's no sidebar or header: the story fills the window.
export const Route = createFileRoute("/e/$id/story")({
  validateSearch: search,
  component: StoryPage,
});

function StoryPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { id } = Route.useParams();
  const { step, page, momentId, mode } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, isAuthenticated ? { eventId } : "skip");
  const moments = useQuery(api.moments.list, event ? { eventId } : "skip");
  const book = useQuery(api.journal.outline, event && mode === "read" ? { eventId } : "skip");
  const me = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");
  useDocumentTitle(event ? `${event.title} · Story-time` : undefined);
  const momentById = useMemo(() => new Map((moments ?? []).map((moment) => [moment._id, moment])), [moments]);
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 900 });
  // The URL follows the scroll without adding history; stable, so the
  // player's effects don't rerun on unrelated renders. It keeps the mode and
  // drops momentId.
  const onStep = useCallback(
    (next: number) => void navigate({ search: (prev) => ({ step: next, mode: prev.mode, back: prev.back }), replace: true, resetScroll: false }),
    [navigate],
  );
  const onPage = useCallback(
    (next: number) => void navigate({ search: (prev) => ({ page: next, mode: "read", back: prev.back }), replace: true, resetScroll: false }),
    [navigate],
  );
  // Playing the film is a step forward. Closing it returns to the book, or to
  // the full note when that is what opened the film.
  const playFilm = useCallback(
    (next: number) => void navigate({ search: (prev) => ({ step: next, page: prev.page, mode: "film", back: prev.mode === "words" ? "words" : undefined }) }),
    [navigate],
  );
  const closeFilm = useCallback(
    (next: number) => void navigate({ search: (prev) => ({ step: next, page: prev.page, mode: prev.back === "words" ? "words" : "read" }), replace: true, resetScroll: false }),
    [navigate],
  );

  if (isLoading) return <Skeleton className="h-svh w-full rounded-none" />;
  // Signing in here keeps the shared link: OAuth comes back to this URL.
  if (!isAuthenticated) return <SignInScreen />;
  if (event === undefined || (event !== null && moments === undefined)) {
    return <Skeleton className="h-svh w-full rounded-none" />;
  }
  if (event === null) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">Experience not found.</p>
        <Button variant="outline" asChild>
          <Link to="/home">Back to experiences</Link>
        </Button>
      </main>
    );
  }

  const listed = moments ?? [];
  const start = momentId ? stepForMoment(buildStorySteps(event.title, listed), momentId) : step;
  if (mode === "film") {
    return (
      <Suspense fallback={<Skeleton className="h-svh w-full rounded-none" />}>
        <StoryPlayer event={event} moments={listed} meId={me?.id} step={start} onStep={onStep} onClose={closeFilm} />
      </Suspense>
    );
  }
  const pages = book?.pages ?? [];
  const surface = mode === "words" ? "story" : book === undefined ? "loading" : playSurface(pages, momentId);
  if (surface === "loading") return <Skeleton className="h-svh w-full rounded-none" />;
  if (surface === "story") {
    return (
      <Suspense fallback={<Skeleton className="h-svh w-full rounded-none" />}>
        <StoryScroll event={event} moments={listed} meId={me?.id} step={start} onStep={onStep} onPlayFilm={playFilm} />
      </Suspense>
    );
  }
  const at = momentId ? pageForPlay(pages, momentId) : page;
  const openMoment = pages[at]?.momentId;
  const filmFrom = openMoment ? stepForMoment(buildStorySteps(event.title, listed), openMoment) : start;
  return (
    <div className="flex h-svh flex-col bg-[#e9dfcb] text-[#1f1a16]">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <h1 className="min-w-0 truncate font-serif text-xl">
          <Link to="/e/$id" params={{ id: event._id }} className="hover:underline">
            {event.title}
          </Link>
        </h1>
        {listed.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => playFilm(filmFrom)}>
            <PlayIcon aria-hidden />
            Play
          </Button>
        )}
      </header>
      <BookStage stage={stage} setSize={setSize}>
        <Reader pages={pages} moments={momentById} size={size} start={at} onPage={onPage} eventId={event._id} />
      </BookStage>
    </div>
  );
}

function BookStage({
  stage,
  setSize,
  children,
}: {
  stage: RefObject<HTMLDivElement | null>;
  setSize: (size: { w: number; h: number }) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage, setSize]);
  return (
    <div ref={stage} className="min-h-0 flex-1">
      {children}
    </div>
  );
}
