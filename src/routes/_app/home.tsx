import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/home")({ component: Home });

function Home() {
  const events = useQuery(api.events.listMine);
  const createDraft = useMutation(api.events.createDraft);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const id = await createDraft();
      await navigate({ to: "/e/$id", params: { id }, search: { panel: "details" as const } });
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  }

  if (events === undefined) return <Skeleton className="h-64 w-full" />;

  if (events.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Start your first experience
        </h1>
        <p className="text-muted-foreground">
          An experience is something you did together. Add moments to it, then
          decide who gets to see it.
        </p>
        <Button size="lg" onClick={() => void start()} disabled={starting}>
          Start
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Experiences</h1>
        <Button onClick={() => void start()} disabled={starting}>
          <PlusIcon /> New
        </Button>
      </div>
      {/* Phone: one card per experience. */}
      <ul className="space-y-3 md:hidden">
        {events.map((e) => (
          <li key={e._id} className="relative rounded-lg border transition-colors hover:bg-accent">
            <Link
              to="/e/$id"
              params={{ id: e._id }}
              className="block p-4 pr-12"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{e.title}</span>
                <Badge variant="secondary">{e.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {e.momentCount} of {e.momentLimit} moments · <span className="capitalize">{e.role}</span>
              </p>
            </Link>
            <div className="absolute top-2 right-2">
              <EventActionsMenu event={e} />
            </div>
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Moments</TableHead>
            <TableHead>Access</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e._id}>
              <TableCell className="font-medium">
                <Link
                  to="/e/$id"
                  params={{ id: e._id }}
                  className="hover:underline"
                >
                  {e.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{e.status}</Badge>
              </TableCell>
              <TableCell>
                {e.momentCount} / {e.momentLimit}
              </TableCell>
              <TableCell className="capitalize">{e.role}</TableCell>
              <TableCell className="text-right">
                <EventActionsMenu event={e} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
