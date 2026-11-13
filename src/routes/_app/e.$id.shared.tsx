import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { Guestbook } from "@/components/event/guestbook";
import { PeopleOnTrip, SharedTab } from "@/components/event/shared-tab";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";

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

export const Route = createFileRoute("/_app/e/$id/shared")({
  loader: ({ context: { prefetch }, params }) => {
    prefetch(queries.events.get({ eventId: params.id }));
    prefetch(queries.guestNotes.list({ eventId: params.id as Id<"events"> }));
  },
  component: PeoplePage,
});
