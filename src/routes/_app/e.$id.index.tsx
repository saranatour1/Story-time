import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon } from "lucide-react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActivityTab } from "@/components/event/activity-tab";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { ItineraryPanel, type Panel } from "@/components/event/itinerary-panel";
import { ItineraryTab } from "@/components/event/itinerary-tab";
import { MomentActionsMenu } from "@/components/event/moment-actions-menu";
import { MomentsTab } from "@/components/event/moments-tab";
import { SettingsTab } from "@/components/event/settings-tab";
import { SharedTab } from "@/components/event/shared-tab";
import { InlineText } from "@/components/inline-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const search = z.object({
  tab: z.enum(["itinerary", "moments", "shared", "activity", "settings"]).default("itinerary").catch("itinerary"),
  groupBy: z.enum(["day", "place", "month"]).default("day").catch("day"),
  panel: z.enum(["outline", "details", "new-moment", "moment"]).default("outline").catch("outline"),
  momentId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/e/$id/")({
  validateSearch: search,
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { tab, groupBy, panel, momentId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { eventId });
  const me = useQuery(api.users.getCurrentUser);
  const update = useMutation(api.events.update);

  if (event === undefined) return <Skeleton className="h-96 w-full" />;
  if (event === null) return <p className="text-muted-foreground">Experience not found.</p>;

  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const canAdd = event.role !== "viewer" && !archived;
  const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);

  // Every panel sits beside the itinerary, so opening one also shows that tab.
  const openPanel = (next: Panel, nextMomentId?: string) =>
    void navigate({
      search: (s) => ({ ...s, tab: "itinerary" as const, panel: next, momentId: nextMomentId }),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <InlineText
              label="title"
              value={event.title}
              disabled={!isOwner || archived}
              className="text-2xl font-bold tracking-tight"
              onSave={(title) => update({ eventId, title })}
            />
            {archived && <Badge variant="secondary">Archived</Badge>}
          </div>
          <InlineText
            label="description"
            multiline
            value={event.description ?? ""}
            placeholder="Add a description"
            disabled={!isOwner || archived}
            className="max-w-prose text-muted-foreground"
            onSave={(description) => update({ eventId, description })}
          />
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <Button className="flex-1 sm:flex-none" onClick={() => openPanel("new-moment")}>
              <PlusIcon /> Add moment
            </Button>
          )}
          <EventActionsMenu
            event={event}
            onEditDetails={() => openPanel("details")}
            onAddMoment={() => openPanel("new-moment")}
          />
        </div>
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

        <TabsContent value="itinerary">
          <div className="flex gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex gap-1" role="group" aria-label="Group by">
                {(["day", "place", "month"] as const).map((g) => (
                  <Button key={g} size="sm" variant={groupBy === g ? "default" : "outline"} onClick={() => void navigate({ search: (s) => ({ ...s, groupBy: g }) })}>
                    By {g}
                  </Button>
                ))}
              </div>
              <ItineraryTab
                eventId={eventId}
                groupBy={groupBy}
                selectedMomentId={panel === "moment" ? momentId : undefined}
                onSelectMoment={(mid) => openPanel("moment", mid)}
                renderActions={(m) => (
                  <MomentActionsMenu
                    eventId={eventId}
                    moment={m}
                    canEdit={canEditMoment(m.authorId)}
                    onEdit={() => openPanel("moment", m._id)}
                    onDeleted={() => {
                      if (panel === "moment" && momentId === m._id) openPanel("outline");
                    }}
                  />
                )}
              />
            </div>
            <ItineraryPanel
              event={event}
              groupBy={groupBy}
              panel={panel}
              momentId={momentId}
              canAdd={canAdd}
              canEditMoment={canEditMoment}
              onNavigate={(next) => openPanel(next.panel, next.momentId)}
            />
          </div>
        </TabsContent>
        <TabsContent value="moments"><MomentsTab eventId={eventId} /></TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="settings"><SettingsTab eventId={eventId} /></TabsContent>}
      </Tabs>
    </div>
  );
}
