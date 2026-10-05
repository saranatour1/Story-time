import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { EventDetailsForm } from "@/components/event/event-details-form";
import { MomentForm } from "@/components/event/moment-form";
import { MomentPreview } from "@/components/event/moment-preview";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// "outline" means no editor is open; the others name the open form.
export type Panel = "outline" | "details" | "new-moment" | "moment";

const TITLES: Record<Exclude<Panel, "outline">, string> = {
  details: "Experience details",
  "new-moment": "New moment",
  moment: "Edit moment",
};

// The form under the itinerary, in the left column: experience details, a new
// moment, or the selected moment being edited.
export function EditorPanel({
  event,
  panel,
  momentId,
  day,
  canEditMoment,
  onClose,
}: {
  event: EventView;
  panel: Exclude<Panel, "outline">;
  momentId?: string;
  day?: string;
  canEditMoment: (authorId: string) => boolean;
  onClose: () => void;
}) {
  const moments = useQuery(api.moments.list, { eventId: event._id });

  let body;
  if (panel === "details") {
    body = <EventDetailsForm event={event} onDone={onClose} />;
  } else if (panel === "new-moment") {
    // `key` resets the form when another day's "+" is used.
    body = (
      <MomentForm
        key={day ?? "new"}
        eventId={event._id}
        day={day}
        full={event.momentCount >= event.momentLimit}
        onDone={onClose}
      />
    );
  } else if (moments === undefined) {
    body = <Skeleton className="h-64 w-full" />;
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

// The right side: every visible moment as a journey, one per screen, in the
// table's order. Scrolling snaps moment to moment and reports the one in view;
// selecting a row jumps here.
export function MomentFeed({
  event,
  order,
  momentId,
  meId,
  canAdd,
  canEditMoment,
  onEdit,
  onAdd,
  onActiveChange,
}: {
  event: EventView;
  // Moment ids from the table; null until it has loaded.
  order: string[] | null;
  momentId?: string;
  meId?: string;
  canAdd: boolean;
  canEditMoment: (authorId: string) => boolean;
  onEdit: (momentId: string) => void;
  onAdd: () => void;
  onActiveChange: (momentId: string) => void;
}) {
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const feed = useRef<HTMLDivElement>(null);
  // The moment the feed last reported, so selecting it doesn't scroll again.
  const reported = useRef<string | undefined>(undefined);

  const byId = useMemo(() => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])), [moments]);
  const list = (order ?? []).flatMap((id) => byId.get(id) ?? []);
  const ids = list.map((m) => m._id).join(",");

  // Jump to a moment chosen in the table. Instant, so the moments passed on
  // the way don't each report themselves as active.
  useEffect(() => {
    const root = feed.current;
    if (!root || !momentId || momentId === reported.current) return;
    const el = root.querySelector<HTMLElement>(`[data-moment-id="${momentId}"]`);
    if (el) root.scrollTo({ top: el.offsetTop });
  }, [momentId, ids]);

  // The moment crossing the feed's middle line is the active one; this works
  // for moments taller than the feed too.
  useEffect(() => {
    const root = feed.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-moment-id");
          if (entry.isIntersecting && id && id !== reported.current) {
            reported.current = id;
            onActiveChange(id);
          }
        }
      },
      { root, rootMargin: "-50% 0px -50% 0px" },
    );
    root.querySelectorAll("[data-moment-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, onActiveChange]);

  if (moments === undefined || order === null) return <Skeleton className="h-96 w-full" />;
  if (moments.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Moments you add show up here, stop by stop.</p>
        {canAdd && (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <PlusIcon /> Add the first moment
          </Button>
        )}
      </div>
    );
  }
  if (list.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No moments match.</p>;
  }
  return (
    <div
      ref={feed}
      aria-label="Moments"
      className="relative h-[calc(100svh-9rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain lg:sticky lg:top-4"
    >
      {list.map((moment) => (
        <section
          key={moment._id}
          data-moment-id={moment._id}
          className="min-h-full snap-start border-b py-4 pr-2 last:border-b-0"
        >
          <MomentPreview
            moment={moment}
            mine={moment.authorId === meId}
            onEdit={canEditMoment(moment.authorId) ? () => onEdit(moment._id) : undefined}
          />
        </section>
      ))}
    </div>
  );
}
