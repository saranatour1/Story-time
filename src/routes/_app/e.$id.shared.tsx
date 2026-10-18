import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { PeopleOnTrip, SharedTab } from "@/components/event/shared-tab";
import { queries } from "@/lib/queries";

// Who can see the experience. Owners manage the link, invites and people;
// everyone else sees who is on it.
const SharedPage = () => {
  const { id } = Route.useParams();
  return (
    <ExperienceShell id={id} section="Shared">
      {(event) =>
        event.role === "owner" ? (
          <SharedTab eventId={event._id} archived={event.status === "archived"} />
        ) : (
          <PeopleOnTrip eventId={event._id} />
        )
      }
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/shared")({
  loader: ({ context: { prefetch }, params }) =>
    prefetch(queries.events.get({ eventId: params.id })),
  component: SharedPage,
});
