import { useQuery } from "convex/react";
import { XIcon } from "lucide-react";
import { api } from "@/lib/api";
import { EventDetailsForm } from "@/components/event/event-details-form";
import { MomentForm } from "@/components/event/moment-form";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// "outline" means no editor is open; the others name the open form.
export type Panel = "outline" | "details" | "moment";

const TITLES: Record<Exclude<Panel, "outline">, string> = {
  details: "Experience details",
  moment: "Edit moment",
};

// The form beside the moments: the experience's details, or a moment being
// edited (`momentId`).
export function EditorPanel({
  event,
  panel,
  momentId,
  canEditMoment,
  onClose,
}: {
  event: EventView;
  panel: Exclude<Panel, "outline">;
  momentId?: string;
  canEditMoment: (authorId: string) => boolean;
  onClose: () => void;
}) {
  const moments = useQuery(api.moments.list, { eventId: event._id });

  let body;
  if (panel === "details") {
    body = <EventDetailsForm event={event} onDone={onClose} />;
  } else if (moments === undefined) {
    body = <Skeleton className="h-[32rem] w-full" />;
  } else {
    const moment = moments.find((m) => m._id === momentId);
    body = !moment ? (
      <p className="text-sm text-muted-foreground">This moment is no longer here.</p>
    ) : canEditMoment(moment.authorId) ? (
      // `key` resets the form when another moment is selected.
      <MomentForm key={moment._id} eventId={event._id} moment={moment} onDone={onClose} />
    ) : (
      <p className="text-sm text-muted-foreground">Only its author or the owner can edit this moment.</p>
    );
  }

  return (
    <section aria-label={TITLES[panel]} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{TITLES[panel]}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      {body}
    </section>
  );
}
