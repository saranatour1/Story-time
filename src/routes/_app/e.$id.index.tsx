import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { BookOpenIcon, PencilIcon, PlayIcon } from "lucide-react";
import { z } from "zod";
import { queries } from "@/lib/queries";
import { CommandBar } from "@/components/event/command-bar";
import { ExperienceShell } from "@/components/event/experience-shell";
import { EditorPanel, type Panel } from "@/components/event/itinerary-panel";
import { Timeline } from "@/components/event/timeline";
import type { EventView } from "@/components/event/types";
import { JournalPreview } from "@/components/journal/preview";
import { Button } from "@/components/ui/button";

const search = z.object({
  // Sections that were tabs here are pages of their own now; links to them
  // are sent on (see beforeLoad).
  tab: z.enum(["itinerary", "shared", "activity", "canvas", "journal", "settings"]).optional().catch(undefined),
  panel: z.enum(["outline", "details", "moment"]).default("outline").catch("outline"),
  // The moment picked in the list.
  momentId: z.string().optional().catch(undefined),
  // The moment open in the editor, kept apart so picking another never swaps
  // out unsaved edits.
  editId: z.string().optional().catch(undefined),
});

const EventPage = () => {
  const { id } = Route.useParams();
  const { panel, momentId, editId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(queries.users.getCurrentUser());

  return (
    <ExperienceShell id={id} section="Moments">
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
            }),
          });
        // On a wide screen picking a moment shows its journal page beside the
        // list. On a phone it edits it when you may, else opens it in the story.
        const pick = (moment: { _id: string; authorId: string }) => {
          if (window.matchMedia("(min-width: 64rem)").matches) void navigate({ search: (s) => ({ ...s, tab: undefined, momentId: moment._id }) });
          else if (canEditMoment(moment.authorId)) openPanel("moment", moment._id);
          else void navigate({ to: "/e/$id/story", params: { id }, search: { momentId: moment._id } });
        };
        return (
          /* The moments, and beside them whatever is being edited, else the
             picked moment's journal page. Stacked on narrow screens, the
             editor first; the page is for wide screens only. */
          <div className="grid max-w-[80rem] gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
            {panel !== "outline" ? (
              <div className="min-w-0 lg:sticky lg:top-4 lg:order-2 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto lg:overscroll-contain">
                <EditorPanel event={event} panel={panel} momentId={editId} canEditMoment={canEditMoment} onClose={() => openPanel("outline")} />
              </div>
            ) : (
              <PickedPage event={event} momentId={momentId} canEditMoment={canEditMoment} onEdit={(id) => openPanel("moment", id)} />
            )}
            <div className="min-w-0 space-y-4 lg:order-1">
              <CommandBar event={event} openMomentId={momentId} />
              <Timeline event={event} meId={me?.id} selectedMomentId={momentId} onPick={pick} />
            </div>
          </div>
        );
      }}
    </ExperienceShell>
  );
};

// Beside the list on a wide screen: the picked moment's journal page with ways
// on from it, or the cover when nothing is picked.
const PickedPage = ({ event, momentId, canEditMoment, onEdit }: { event: EventView; momentId?: string; canEditMoment: (authorId: string) => boolean; onEdit: (id: Id<"moments">) => void }) => {
  const { data: moments } = useQuery(queries.moments.list({ eventId: event._id }));
  const moment = moments?.find((m) => m._id === momentId);
  // The aside is hidden below `lg`. Mounting it there would still subscribe
  // to the page, so a phone does not.
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 64rem)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (!wide) return null;
  return (
    <aside aria-label="Its journal page" className="hidden min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-2 lg:block">
      <JournalPreview event={event} momentId={moment?._id} scale={448 / 794} />
      <div className="flex flex-wrap gap-2">
        {moment && (
          <Button size="sm" asChild>
            <Link to="/e/$id/story" params={{ id: event._id }} search={{ momentId: moment._id }}>
              <PlayIcon aria-hidden /> Play from here
            </Link>
          </Button>
        )}
        {moment && canEditMoment(moment.authorId) && (
          <Button size="sm" variant="outline" onClick={() => onEdit(moment._id)}>
            <PencilIcon aria-hidden /> Edit
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link to="/e/$id/journal" params={{ id: event._id }} search={{ momentId: moment?._id }}>
            <BookOpenIcon aria-hidden /> {moment ? "Open in the journal" : "Open the journal"}
          </Link>
        </Button>
      </div>
      {!moment && event.momentCount > 0 && <p className="text-sm text-muted-foreground">Pick a moment to see its page.</p>}
    </aside>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/")({
  // Old edit links name the moment in `momentId` only.
  validateSearch: search.transform((s) => (s.panel === "moment" && !s.editId && s.momentId ? { ...s, editId: s.momentId } : s)),
  beforeLoad: ({ search: s, params }) => {
    if (s.tab === "shared") throw redirect({ to: "/e/$id/shared", params });
    if (s.tab === "activity") throw redirect({ to: "/e/$id/activity", params });
    if (s.tab === "canvas" || s.tab === "journal") throw redirect({ to: "/e/$id/journal", params });
  },
  // Started together, rather than the moments waiting on the experience.
  loader: ({ context: { prefetch }, params }) => {
    const eventId = params.id as Id<"events">;
    prefetch(queries.events.get({ eventId }));
    prefetch(queries.moments.list({ eventId }));
    prefetch(queries.journal.unpaged({ eventId }));
  },
  component: EventPage,
});
