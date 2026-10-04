import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ActivityTab({ eventId }: { eventId: Id<"events"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.changes.listForEvent,
    { eventId },
    { initialNumItems: 25 },
  );
  if (status === "LoadingFirstPage") return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>What</TableHead>
            <TableHead>Changed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((c) => (
            <TableRow key={c._id}>
              <TableCell className="text-muted-foreground">{new Date(c.at).toLocaleString()}</TableCell>
              <TableCell>
                {c.entity} {c.action}
                {c.actorId ? "" : " (system)"}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.fields.join(", ") || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(25)}>Load more</Button>
      )}
    </div>
  );
}
