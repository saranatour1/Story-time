import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MomentCard } from "@/components/event/moment-card";
import { Skeleton } from "@/components/ui/skeleton";

export function MomentsTab({ eventId }: { eventId: Id<"events"> }) {
  const moments = useQuery(api.moments.list, { eventId });
  if (moments === undefined) return <Skeleton className="h-48 w-full" />;
  if (moments.length === 0) return <p className="py-12 text-center text-muted-foreground">No moments yet.</p>;

  return (
    <div className="magnetic grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <span className="magnetic-indicator" aria-hidden />
      {moments.map((m) => (
        <MomentCard key={m._id} moment={m} />
      ))}
    </div>
  );
}
