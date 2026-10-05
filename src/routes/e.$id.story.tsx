import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { StoryPlayer } from "@/components/story/story-player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildStorySteps, stepForMoment } from "@/lib/story-steps";

const search = z.object({
  // Which scene is showing; each one is a URL of its own.
  step: z.number().int().min(0).default(0).catch(0),
  // Start at this moment's first scene, then drop out of the URL.
  momentId: z.string().optional().catch(undefined),
});

// Outside `_app`, so there's no sidebar or header: the story fills the window.
export const Route = createFileRoute("/e/$id/story")({
  validateSearch: search,
  component: StoryPage,
});

function StoryPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { id } = Route.useParams();
  const { step, momentId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, isAuthenticated ? { eventId } : "skip");
  const moments = useQuery(api.moments.list, event ? { eventId } : "skip");
  const me = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (!momentId || !event || !moments) return;
    const steps = buildStorySteps(event.title, moments);
    void navigate({ search: { step: stepForMoment(steps, momentId) }, replace: true });
  }, [momentId, event, moments, navigate]);

  if (isLoading) return <Skeleton className="h-svh w-full rounded-none" />;
  if (!isAuthenticated) return <Navigate to="/" />;
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

  return (
    <StoryPlayer
      event={event}
      moments={moments ?? []}
      meId={me?.id}
      step={step}
      onStep={(next, mode) => void navigate({ search: { step: next }, replace: mode === "replace" })}
    />
  );
}
