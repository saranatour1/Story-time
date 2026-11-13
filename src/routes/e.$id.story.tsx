import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { lazy, Suspense, useCallback } from "react";
import { z } from "zod";
import { queries } from "@/lib/queries";
import type { Id } from "../../convex/_generated/dataModel";
import { SignInScreen } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSeen } from "@/hooks/use-seen";
import { buildStorySteps, stepForMoment } from "@/lib/story-steps";

const StoryPlayer = lazy(() =>
  import("@/components/story/story-player").then((m) => ({ default: m.StoryPlayer })),
);
const StoryScroll = lazy(() =>
  import("@/components/story/story-scroll").then((m) => ({ default: m.StoryScroll })),
);

const search = z.object({
  // The scene in view, kept up to date as the film plays or the story scrolls.
  step: z.number().int().min(0).default(0).catch(0),
  // Start at this moment, then drop out of the URL.
  momentId: z.string().optional().catch(undefined),
  // The story to read, or the film to watch.
  mode: z.enum(["read", "film"]).default("read").catch("read"),
});

const StoryPage = () => {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { id } = Route.useParams();
  const { step, momentId, mode } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const { data: event } = useQuery(queries.events.get(isAuthenticated ? { eventId } : "skip"));
  const { data: moments } = useQuery(queries.moments.list(event ? { eventId } : "skip"));
  const { data: me } = useQuery(queries.users.getCurrentUser(isAuthenticated ? {} : "skip"));
  useDocumentTitle(event ? `${event.title} · Story-time` : undefined);
  useSeen(event?._id);
  // The URL follows the scroll without adding history; stable, so the
  // player's effects don't rerun on unrelated renders. It keeps the mode and
  // drops momentId.
  const onStep = useCallback(
    (next: number) =>
      void navigate({
        search: (prev) => ({ step: next, mode: prev.mode }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );
  // Playing the film is a step forward. Closing it returns to the story, at
  // the scene the film had reached.
  const playFilm = useCallback(
    (next: number) => void navigate({ search: { step: next, mode: "film" } }),
    [navigate],
  );
  const closeFilm = useCallback(
    (next: number) =>
      void navigate({
        search: { step: next, mode: "read" },
        replace: true,
        resetScroll: false,
      }),
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

  // An archived moment is out of the story, for its owner too.
  const listed = (moments ?? []).filter((moment) => !moment.archived);
  const start = momentId ? stepForMoment(buildStorySteps(event.title, listed), momentId) : step;
  return (
    <Suspense fallback={<Skeleton className="h-svh w-full rounded-none" />}>
      {mode === "film" ? (
        <StoryPlayer
          event={event}
          moments={listed}
          meId={me?.id}
          step={start}
          onStep={onStep}
          onClose={closeFilm}
        />
      ) : (
        <StoryScroll
          event={event}
          moments={listed}
          meId={me?.id}
          step={start}
          onStep={onStep}
          onPlayFilm={playFilm}
        />
      )}
    </Suspense>
  );
};

// Outside `_app`, so there's no sidebar or header: the story fills the window.
export const Route = createFileRoute("/e/$id/story")({
  validateSearch: search,
  // Signed-in readers only; the page asks again once it knows.
  loader: ({ context: { prefetch }, params }) => {
    const eventId = params.id as Id<"events">;
    prefetch(queries.events.get({ eventId }));
    prefetch(queries.moments.list({ eventId }));
    prefetch(queries.users.getCurrentUser());
  },
  component: StoryPage,
});
