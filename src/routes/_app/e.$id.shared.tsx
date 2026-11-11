import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { Guestbook } from "@/components/event/guestbook";
import { PeopleOnTrip, SharedTab } from "@/components/event/shared-tab";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";

// Who can see the experience, and the notes they left. Owners manage the
// link, invites and people; everyone else sees who is on it.
const PeoplePage = () => {
  const { id } = Route.useParams();
  return (
    <ExperienceShell id={id} section="People">
      {(event) => (
        <div className="mx-auto max-w-3xl space-y-6">
          {event.role === "owner" ? (
            <SharedTab eventId={event._id} archived={event.status === "archived"} />
          ) : (
            <PeopleOnTrip eventId={event._id} />
          )}
          <Guestbook eventId={event._id} archived={event.status === "archived"} />
        </div>
      )}
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/shared")({
  loader: ({ context: { prefetch }, params }) => {
    prefetch(queries.events.get({ eventId: params.id }));
    prefetch(queries.guestNotes.list({ eventId: params.id as Id<"events"> }));
  },
  component: PeoplePage,
});
