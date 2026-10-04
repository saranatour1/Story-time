import { useQuery } from "convex/react";
import { PlusIcon, XIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { EventDetailsForm } from "@/components/event/event-details-form";
import { groupAnchor } from "@/components/event/itinerary-tab";
import { MomentCard } from "@/components/event/moment-card";
import { MomentForm } from "@/components/event/moment-form";
import type { EventView, GroupBy, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type Panel = "outline" | "details" | "new-moment" | "moment";

type Props = {
  event: EventView;
  groupBy: GroupBy;
  panel: Panel;
  momentId?: string;
  canAdd: boolean;
  canEditMoment: (authorId: string) => boolean;
  onNavigate: (next: { panel: Panel; momentId?: string }) => void;
};

const TITLES: Record<Panel, string> = {
  outline: "Itinerary",
  details: "Experience details",
  "new-moment": "New moment",
  moment: "Moment",
};

// The secondary sidebar beside the itinerary: an outline for jumping around,
// and the place where details and moments are created and edited.
// Desktop: a sticky column. Phone: a sheet that opens only while editing.
export function ItineraryPanel(props: Props) {
  const isMobile = useIsMobile();
  const close = () => props.onNavigate({ panel: "outline" });

  if (isMobile) {
    return (
      <Sheet open={props.panel !== "outline"} onOpenChange={(open) => !open && close()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{TITLES[props.panel]}</SheetTitle>
            <SheetDescription className="sr-only">{props.event.title}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <PanelBody {...props} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label={TITLES[props.panel]}
      className="sticky top-4 hidden max-h-[calc(100svh-6rem)] w-72 shrink-0 self-start overflow-y-auto border-l pl-6 md:block lg:w-80"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{TITLES[props.panel]}</h2>
        {props.panel !== "outline" && (
          <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={close}>
            <XIcon />
          </Button>
        )}
      </div>
      <PanelBody {...props} />
    </aside>
  );
}

function PanelBody({ event, groupBy, panel, momentId, canAdd, canEditMoment, onNavigate }: Props) {
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const close = () => onNavigate({ panel: "outline" });

  if (panel === "details") return <EventDetailsForm event={event} onDone={close} />;
  if (panel === "new-moment") {
    return (
      <MomentForm eventId={event._id} full={event.momentCount >= event.momentLimit} onDone={close} />
    );
  }
  if (panel === "moment") {
    if (moments === undefined) return <Skeleton className="h-64 w-full" />;
    const moment = moments.find((m) => m._id === momentId);
    if (!moment) return <p className="text-sm text-muted-foreground">This moment is no longer here.</p>;
    return canEditMoment(moment.authorId) ? (
      // `key` resets the form when another moment is selected.
      <MomentForm key={moment._id} eventId={event._id} moment={moment} onDone={close} />
    ) : (
      <MomentCard moment={moment} />
    );
  }
  return (
    <Outline event={event} groupBy={groupBy} selectedMomentId={momentId} canAdd={canAdd} onNavigate={onNavigate} />
  );
}

function Outline({
  event,
  groupBy,
  selectedMomentId,
  canAdd,
  onNavigate,
}: Pick<Props, "event" | "groupBy" | "canAdd" | "onNavigate"> & { selectedMomentId?: string }) {
  const groups = useQuery(api.itinerary.grouped, { eventId: event._id, groupBy });
  if (groups === undefined) return <Skeleton className="h-40 w-full" />;
  if (groups.length === 0) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>No moments yet.</p>
        {canAdd && (
          <Button size="sm" onClick={() => onNavigate({ panel: "new-moment" })}>
            <PlusIcon /> Add moment
          </Button>
        )}
      </div>
    );
  }

  return (
    <nav aria-label="Itinerary outline" className="space-y-4 text-sm">
      {groups.map((g) => (
        <div key={g.key}>
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={() =>
              document.getElementById(groupAnchor(g.key))?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {g.label}
          </button>
          <ul className="mt-1 ml-1 space-y-0.5 border-l pl-3">
            {g.moments.map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  onClick={() => onNavigate({ panel: "moment", momentId: m._id })}
                  className={cn(
                    "w-full truncate rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground",
                    m._id === selectedMomentId && "bg-accent text-foreground",
                  )}
                >
                  {new Date(m.startsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {m.place ?? firstLine(m)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function firstLine(m: MomentView) {
  const text = m.blocks.find((b) => b.type === "note" || b.type === "feeling");
  return text && "text" in text ? text.text.split("\n")[0]!.slice(0, 40) : "Moment";
}
