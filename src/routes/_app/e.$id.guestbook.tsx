import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { Guestbook } from "@/components/event/guestbook";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";

// Short notes from the people who were there, a section of its own.
const GuestbookPage = () => {
  const { id } = Route.useParams();
  return (
    <ExperienceShell id={id} section="Guestbook">
      {(event) => <Guestbook eventId={event._id} archived={event.status === "archived"} />}
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/guestbook")({
  loader: ({ context: { prefetch }, params }) => {
    prefetch(queries.events.get({ eventId: params.id }));
    prefetch(queries.guestNotes.list({ eventId: params.id as Id<"events"> }));
  },
  component: GuestbookPage,
});
