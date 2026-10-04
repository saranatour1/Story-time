import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

export function SettingsTab({ eventId }: { eventId: Id<"events"> }) {
  const event = useQuery(api.events.get, { eventId });
  const requests = useQuery(api.quota.listForEvent, { eventId });
  const requestMore = useMutation(api.quota.request);
  if (!event) return null;

  return (
    <div className="max-w-md space-y-8">
      <section className="space-y-2">
        <h2 className="font-semibold">Moments</h2>
        <p className="text-sm text-muted-foreground">
          {event.momentCount} of {event.momentLimit} used.
        </p>
        <Button
          variant="outline"
          onClick={() =>
            void requestMore({ eventId, extra: 10 })
              .then(() => toast.success("Requested 10 more moments"))
              .catch((e) => toast.error(errorMessage(e)))
          }
        >
          Request 10 more
        </Button>
        {requests?.map((r) => (
          <p key={r._id} className="text-xs text-muted-foreground">
            +{r.extra} requested, {r.status}
          </p>
        ))}
      </section>
    </div>
  );
}
