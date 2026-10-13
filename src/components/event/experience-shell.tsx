import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import { queries } from "@/lib/queries";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { eventDates } from "@/components/event/event-dates";
import { QuickAddButton } from "@/components/event/quick-add";
import type { EventView } from "@/components/event/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";

// An experience, loaded once for whichever of its sections is open (moments,
// journal, sharing, activity): the not-found and loading states, and, unless
// `bare`, the header with its name and its Play, Add and More.
export const ExperienceShell = ({
  id,
  section,
  bare = false,
  children,
}: {
  id: string;
  section?: string;
  bare?: boolean;
  children: (event: EventView) => ReactNode;
}) => {
  const navigate = useNavigate();
  const { data: event } = useQuery(queries.events.get({ eventId: id }));
  useDocumentTitle(event ? `${section ? `${section} · ` : ""}${event.title} · Story-time` : undefined);

  if (event === undefined) {
    return (
      <div aria-hidden className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-72 w-full max-w-3xl" />
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-24 text-center">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Experience not found</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted, or you no longer have access.</p>
        <Button variant="outline" className="mt-2" asChild>
          <Link to="/home">
            <ArrowLeftIcon /> Back to experiences
          </Link>
        </Button>
      </div>
    );
  }
  if (bare) return <>{children(event)}</>;

  const dates = eventDates(event);
  const archived = event.status === "archived";
  return (
    <div className="space-y-5">
      {/* The experience's name, dates and size. Playing it as a story is the
          payoff, so that button leads. */}
      <header className="flex max-w-[80rem] flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance break-words sm:text-3xl">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-muted-foreground">
              {dates && <>{dates} · </>}
              {event.momentCount} {event.momentCount === 1 ? "moment" : "moments"}
            </p>
            {archived && <Badge variant="secondary">Archived</Badge>}
            {event.status === "draft" && <Badge variant="outline">Draft</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {event.momentCount > 0 && (
            <Button asChild className="bg-amber-300 text-stone-950 shadow-sm hover:bg-amber-200 dark:bg-amber-200 dark:hover:bg-amber-100">
              <Link to="/e/$id/story" params={{ id }} search={{ step: 0 }} data-track="story_played" data-from="experience">
                <PlayIcon className="fill-current" /> Play story
              </Link>
            </Button>
          )}
          <QuickAddButton event={event} variant={event.momentCount > 0 ? "outline" : "default"} />
          <EventActionsMenu event={event} onEditDetails={() => void navigate({ to: "/e/$id", params: { id }, search: { panel: "details" } })} />
        </div>
      </header>
      {children(event)}
    </div>
  );
};
