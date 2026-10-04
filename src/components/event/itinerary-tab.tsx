import { useQuery } from "convex/react";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GroupBy, MomentView } from "@/components/event/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type { GroupBy } from "@/components/event/types";

// The outline links to groups by this id.
export const groupAnchor = (key: string) => `group-${key}`;

const time = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ItineraryTab({
  eventId,
  groupBy,
  selectedMomentId,
  onSelectMoment,
  renderActions,
}: {
  eventId: Id<"events">;
  groupBy: GroupBy;
  selectedMomentId?: string;
  onSelectMoment: (momentId: string) => void;
  renderActions: (moment: MomentView) => ReactNode;
}) {
  const groups = useQuery(api.itinerary.grouped, { eventId, groupBy });
  const [closed, setClosed] = useState<Set<string>>(new Set());

  if (groups === undefined) return <Skeleton className="h-48 w-full" />;
  if (groups.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No moments yet. Add one to start the itinerary.</p>;
  }

  return (
    // A container, so rows switch to columns based on the list's own width:
    // with the panel open the list is much narrower than the screen.
    <div className="@container divide-y rounded-lg border">
      {groups.map((g) => {
        const open = !closed.has(g.key);
        return (
          <section key={g.key} id={groupAnchor(g.key)} className="scroll-mt-4">
            <button
              type="button"
              aria-expanded={open}
              className="flex w-full items-center gap-2 bg-muted/50 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
              onClick={() =>
                setClosed((s) => {
                  const next = new Set(s);
                  if (!next.delete(g.key)) next.add(g.key);
                  return next;
                })
              }
            >
              <ChevronDownIcon className={`size-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <span className="truncate">{g.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{g.moments.length}</span>
            </button>
            {open && (
              <ul className="divide-y">
                {g.moments.map((m) => {
                  const selected = m._id === selectedMomentId;
                  return (
                    <li key={m._id} className={cn("flex items-center gap-1 pr-2", selected && "bg-accent")}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelectMoment(m._id)}
                        // Stacked when the list is narrow; three columns from 32rem.
                        className="grid min-w-0 flex-1 gap-1 px-3 py-3 text-left text-sm hover:bg-accent/50 @lg:grid-cols-[11rem_9rem_1fr] @lg:items-baseline @lg:gap-4"
                      >
                        <span className="text-muted-foreground">{time(m.startsAt)}</span>
                        <span className="truncate font-medium @lg:font-normal">{m.place ?? "No place"}</span>
                        <span className="text-muted-foreground">{summary(m.blocks)}</span>
                      </button>
                      {renderActions(m)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function summary(blocks: Array<{ type: string }>) {
  const count = (t: string) => blocks.filter((b) => b.type === t).length;
  return [
    [count("photo"), "photo"],
    [count("note"), "note"],
    [count("link"), "link"],
    [count("feeling"), "feeling"],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`)
    .join(" · ");
}
