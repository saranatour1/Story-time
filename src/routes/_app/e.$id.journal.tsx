import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExperienceShell } from "@/components/event/experience-shell";
import { Guestbook } from "@/components/event/guestbook";
import { JournalBook } from "@/components/journal/book";

// The experience as a journal of A4 pages, full width: the page is the point.
const JournalPage = () => {
  const { id } = Route.useParams();
  const { momentId } = Route.useSearch();
  return (
    <ExperienceShell id={id} section="Journal" bare>
      {(event) => (
        <>
          <JournalBook event={event} momentId={momentId} />
          <Guestbook eventId={event._id} archived={event.status === "archived"} />
        </>
      )}
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/journal")({
  // Opens on this moment's page.
  validateSearch: z.object({ momentId: z.string().optional().catch(undefined) }),
  component: JournalPage,
});
