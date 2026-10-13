import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExperienceShell } from "@/components/event/experience-shell";
import { JournalBook } from "@/components/journal/book";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";

// The experience as a journal of A4 pages, full width: the page is the point.
const JournalPage = () => {
  const { id } = Route.useParams();
  const { momentId } = Route.useSearch();
  return (
    <ExperienceShell id={id} section="Journal" bare>
      {(event) => <JournalBook event={event} momentId={momentId} />}
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/journal")({
  // Opens on this moment's page.
  validateSearch: z.object({ momentId: z.string().optional().catch(undefined) }),
  loader: ({ context: { prefetch }, params }) => {
    const eventId = params.id as Id<"events">;
    prefetch(queries.events.get({ eventId }));
    prefetch(queries.journal.outline({ eventId }));
    prefetch(queries.moments.list({ eventId }));
    prefetch(queries.journal.stickers({ eventId }));
  },
  component: JournalPage,
});
