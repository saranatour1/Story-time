import { createFileRoute } from "@tanstack/react-router";
import { ExperienceShell } from "@/components/event/experience-shell";
import { SharedTab } from "@/components/event/shared-tab";
import { queries } from "@/lib/queries";

// Who can see the experience: the link, invites and people. Its owner's only.
const SharedPage = () => {
  const { id } = Route.useParams();
  return (
    <ExperienceShell id={id} section="Shared">
      {(event) =>
        event.role === "owner" ? (
          <SharedTab eventId={event._id} archived={event.status === "archived"} />
        ) : (
          <p className="text-sm text-muted-foreground">Only the experience's owner can see who it is shared with.</p>
        )
      }
    </ExperienceShell>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/e/$id/shared")({
  loader: ({ context: { prefetch }, params }) => prefetch(queries.events.get({ eventId: params.id })),
  component: SharedPage,
});
