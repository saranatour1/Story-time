import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { PlusIcon } from "lucide-react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActivityTab } from "@/components/event/activity-tab";
import { ItineraryTab } from "@/components/event/itinerary-tab";
import { MomentsTab } from "@/components/event/moments-tab";
import { SettingsTab } from "@/components/event/settings-tab";
import { SharedTab } from "@/components/event/shared-tab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const search = z.object({
  tab: z.enum(["itinerary", "moments", "shared", "activity", "settings"]).default("itinerary").catch("itinerary"),
  groupBy: z.enum(["day", "place", "month"]).default("day").catch("day"),
});

export const Route = createFileRoute("/_app/e/$id/")({
  validateSearch: search,
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { tab, groupBy } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { eventId });

  if (event === undefined) return <Skeleton className="h-96 w-full" />;
  if (event === null) return <p className="text-muted-foreground">Experience not found.</p>;
  const isOwner = event.role === "owner";
  const canAdd = event.role !== "viewer";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
          {event.description && <p className="mt-1 max-w-prose text-muted-foreground">{event.description}</p>}
        </div>
        {canAdd && (
          <Button asChild className="w-full sm:w-auto">
            <Link to="/e/$id/new" params={{ id }}>
              <PlusIcon /> Add moment
            </Link>
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(t) => void navigate({ search: (s) => ({ ...s, tab: t as typeof tab }) })}>
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="moments">Moments</TabsTrigger>
          {isOwner && <TabsTrigger value="shared">Shared</TabsTrigger>}
          {isOwner && <TabsTrigger value="activity">Activity</TabsTrigger>}
          {isOwner && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
        </div>

        <TabsContent value="itinerary" className="space-y-4">
          <div className="flex gap-1" role="group" aria-label="Group by">
            {(["day", "place", "month"] as const).map((g) => (
              <Button key={g} size="sm" variant={groupBy === g ? "default" : "outline"} onClick={() => void navigate({ search: (s) => ({ ...s, groupBy: g }) })}>
                By {g}
              </Button>
            ))}
          </div>
          <ItineraryTab eventId={eventId} groupBy={groupBy} />
        </TabsContent>
        <TabsContent value="moments"><MomentsTab eventId={eventId} /></TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="settings"><SettingsTab eventId={eventId} /></TabsContent>}
      </Tabs>
    </div>
  );
}
