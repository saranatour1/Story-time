import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/queries";
import { ActivityTab } from "@/components/event/activity-tab";
import { ExperienceShell } from "@/components/event/experience-shell";

// What changed in the experience, and who changed it. Its owner's only.
const ActivityPage = () => {
  const { id } = Route.useParams();
  const { data: me } = useQuery(queries.users.getCurrentUser());
  return (
    <ExperienceShell id={id} section="Activity">
      {(event) =>
        event.role === "owner" ? (
          <ActivityTab eventId={event._id} meId={me?.id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the experience's owner can see its activity.
          </p>
        )
      }
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/activity")({
  loader: ({ context: { prefetch }, params }) =>
    prefetch(queries.events.get({ eventId: params.id })),
  component: ActivityPage,
});
