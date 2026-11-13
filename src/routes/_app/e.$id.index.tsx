import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { z } from "zod";
import { queries } from "@/lib/queries";
import { CommandBar } from "@/components/event/command-bar";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { eventDates } from "@/components/event/event-dates";
import { ExperienceActions, ExperienceShell } from "@/components/event/experience-shell";
import { EditorPanel, type Panel } from "@/components/event/itinerary-panel";
import { MomentPeek } from "@/components/event/moment-peek";
import { Timeline } from "@/components/event/timeline";
import { ROLE_LABEL } from "@/components/event/shared-tab";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/components/user-avatar";

const search = z.object({
  // Sections that were tabs here are pages of their own now; links to them
  // are sent on (see beforeLoad).
  tab: z.enum(["itinerary", "shared", "activity", "settings"]).optional().catch(undefined),
  panel: z.enum(["outline", "details", "moment"]).default("outline").catch("outline"),
  // The moment picked in the list, open to look at when `peek` is set.
  momentId: z.string().optional().catch(undefined),
  // The moment open in the editor, kept apart so picking another never swaps
  // out unsaved edits.
  editId: z.string().optional().catch(undefined),
  peek: z.boolean().optional().catch(undefined),
});

const EventPage = () => {
  const { id } = Route.useParams();
  const { panel, momentId, editId, peek } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(queries.users.getCurrentUser());

  return (
    <ExperienceShell id={id} section="Moments" actions={false}>
      {(event) => {
        const isOwner = event.role === "owner";
        const archived = event.status === "archived";
        const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);
        // Editors open beside the moments.
        const openPanel = (next: Panel, nextMomentId?: string) =>
          void navigate({
            search: (s) => ({
              ...s,
              tab: undefined,
              panel: next,
              momentId: nextMomentId ?? (next === "outline" ? s.momentId : undefined),
              editId: next === "moment" ? nextMomentId : undefined,
              peek: undefined,
            }),
          });
        // Picking a moment opens it to look at; Edit is a step from there, or
        // the tile's own button.
        const pick = (moment: { _id: string }) =>
          void navigate({
            search: (s) => ({ ...s, tab: undefined, momentId: moment._id, peek: true }),
            resetScroll: false,
          });
        const closePeek = () =>
          void navigate({ search: (s) => ({ ...s, peek: undefined }), resetScroll: false });
        return (
          /* The moments on the left. On the right, the experience's buttons
             and its overview, or whatever is being edited. Stacked on narrow
             screens, the right column first. */
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
            <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:order-2 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto lg:overscroll-contain">
              <ExperienceActions event={event} />
              {panel === "outline" ? (
                <>
                  <Overview event={event} onSettings={() => openPanel("details")} />
                  <People eventId={event._id} />
                </>
              ) : (
                <EditorPanel
                  event={event}
                  panel={panel}
                  momentId={editId}
                  canEditMoment={canEditMoment}
                  onClose={() => openPanel("outline")}
                />
              )}
            </aside>
            <div className="min-w-0 space-y-4 lg:order-1">
              {peek && momentId && (
                <Peek
                  eventId={event._id}
                  momentId={momentId}
                  canEdit={canEditMoment}
                  onEdit={() => openPanel("moment", momentId)}
                  onClose={closePeek}
                />
              )}
              <CommandBar event={event} openMomentId={momentId} />
              <Timeline
                event={event}
                meId={me?.id}
                selectedMomentId={momentId}
                onPick={pick}
                canEdit={canEditMoment}
                onEdit={(m) => openPanel("moment", m._id)}
              />
            </div>
          </div>
        );
      }}
    </ExperienceShell>
  );
};

// The picked moment, open to look at. Nothing shows until the list has it.
const Peek = ({
  eventId,
  momentId,
  canEdit,
  onEdit,
  onClose,
}: {
  eventId: Id<"events">;
  momentId: string;
  canEdit: (authorId: string) => boolean;
  onEdit: () => void;
  onClose: () => void;
}) => {
  const { data: moments } = useQuery(queries.moments.list({ eventId }));
  const moment = moments?.find((m) => m._id === momentId);
  if (!moment) return null;
  return (
    <MomentPeek
      moment={moment}
      onEdit={canEdit(moment.authorId) ? onEdit : undefined}
      onClose={onClose}
    />
  );
};

// The experience at a glance, from its details: what it is, when, how big and
// who can see it, with the way to its settings for the owner.
const Overview = ({ event, onSettings }: { event: EventView; onSettings: () => void }) => {
  const dates = eventDates(event);
  const canChange = event.role === "owner" && event.status !== "archived";
  return (
    <section aria-labelledby="overview" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="overview" className="text-sm font-medium">
          Overview
        </h2>
        {canChange && (
          <Button variant="ghost" size="sm" className="-mr-2" onClick={onSettings}>
            Settings <ArrowRightIcon />
          </Button>
        )}
      </div>
      {event.description ? (
        <p className="line-clamp-6 text-sm whitespace-pre-line">{event.description}</p>
      ) : (
        canChange && <p className="text-sm text-muted-foreground">No description yet.</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Dates</dt>
        <dd>{dates ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Moments</dt>
        <dd>{event.momentCount}</dd>
        <dt className="text-muted-foreground">Who can see it</dt>
        <dd>{event.visibility === "link" ? "Anyone with the link" : "Only people invited"}</dd>
      </dl>
    </section>
  );
};

// Who is on the trip, as Shared lists them: the first page, and the way to
// Shared itself, where the rest are.
const People = ({ eventId }: { eventId: Id<"events"> }) => {
  const people = usePaginatedQuery(api.sessions.members, { eventId }, { initialNumItems: 5 });
  return (
    <section aria-labelledby="people" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="people" className="text-sm font-medium">
          People
        </h2>
        <Button variant="ghost" size="sm" className="-mr-2" asChild>
          <Link to="/e/$id/shared" params={{ id: eventId }}>
            Shared <ArrowRightIcon />
          </Link>
        </Button>
      </div>
      {people.status === "LoadingFirstPage" ? (
        <Skeleton aria-hidden className="h-16 w-full" />
      ) : (
        <ul className="space-y-2">
          {people.results.map((m) => (
            <li key={m.userId} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
              >
                {initials(m.displayName) || <UsersIcon className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{m.displayName ?? "Anonymous"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.sessionId === null ? "Owner" : ROLE_LABEL[m.role]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {people.status === "CanLoadMore" && (
        <p className="text-xs text-muted-foreground">And more on Shared.</p>
      )}
    </section>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/")({
  // Old edit links name the moment in `momentId` only.
  validateSearch: search.transform((s) =>
    s.panel === "moment" && !s.editId && s.momentId ? { ...s, editId: s.momentId } : s,
  ),
  beforeLoad: ({ search: s, params }) => {
    if (s.tab === "shared") throw redirect({ to: "/e/$id/shared", params });
    if (s.tab === "activity") throw redirect({ to: "/e/$id/activity", params });
  },
  // Started together, rather than the moments waiting on the experience.
  loader: ({ context: { prefetch }, params }) => {
    const eventId = params.id as Id<"events">;
    prefetch(queries.events.get({ eventId }));
    prefetch(queries.moments.list({ eventId }));
  },
  component: EventPage,
});
