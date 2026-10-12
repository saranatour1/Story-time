import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { ActivityTab } from "@/components/event/activity-tab";
import { ExperienceShell } from "@/components/event/experience-shell";

export const Route = createFileRoute("/_app/e/$id/activity")({ component: ActivityPage });

// What changed in the experience, and who changed it. Its owner's only.
function ActivityPage() {
  const { id } = Route.useParams();
  const me = useQuery(api.users.getCurrentUser);
  return (
    <ExperienceShell id={id} section="Activity">
      {(event) =>
        event.role === "owner" ? (
          <ActivityTab eventId={event._id} meId={me?.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Only the experience's owner can see its activity.</p>
        )
      }
    </ExperienceShell>
  );
}
