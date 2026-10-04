import { useQuery } from "convex/react";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

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
    <Table>
      <TableBody>
        {groups.map((g) => {
          const open = !closed.has(g.key);
          return [
            <TableRow
              key={g.key}
              className="cursor-pointer bg-muted/50 hover:bg-muted"
              onClick={() =>
                setClosed((s) => {
                  const next = new Set(s);
                  if (!next.delete(g.key)) next.add(g.key);
                  return next;
                })
              }
            >
              <TableCell colSpan={3} className="font-medium">
                <span className="inline-flex items-center gap-2">
                  <ChevronDownIcon className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
                  {g.label}
                  <span className="text-xs font-normal text-muted-foreground">{g.moments.length}</span>
                </span>
              </TableCell>
            </TableRow>,
            ...(open
              ? g.moments.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell className="w-48 text-muted-foreground">{time(m.startsAt)}</TableCell>
                    <TableCell className="w-48">{m.place ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {summary(m.blocks)}
                    </TableCell>
                  </TableRow>
                ))
              : []),
          ];
        })}
      </TableBody>
    </Table>
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
