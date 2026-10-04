import { useQuery } from "convex/react";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";

export type GroupBy = "day" | "place" | "month";

const time = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ItineraryTab({ eventId, groupBy }: { eventId: Id<"events">; groupBy: GroupBy }) {
  const groups = useQuery(api.itinerary.grouped, { eventId, groupBy });
  const [closed, setClosed] = useState<Set<string>>(new Set());

  if (groups === undefined) return <Skeleton className="h-48 w-full" />;
  if (groups.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">No moments yet. Add one to start the itinerary.</p>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {groups.map((g) => {
        const open = !closed.has(g.key);
        return (
          <section key={g.key}>
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
                {g.moments.map((m) => (
                  // Stacked on a phone; three columns from `sm` up.
                  <li
                    key={m._id}
                    className="grid gap-1 px-3 py-3 text-sm sm:grid-cols-[12rem_10rem_1fr] sm:items-baseline sm:gap-4"
                  >
                    <span className="text-muted-foreground">{time(m.startsAt)}</span>
                    <span className="truncate font-medium sm:font-normal">{m.place ?? "No place"}</span>
                    <span className="text-muted-foreground">{summary(m.blocks)}</span>
                  </li>
                ))}
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
