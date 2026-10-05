import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { PlusIcon } from "lucide-react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActivityTab } from "@/components/event/activity-tab";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { ItineraryPanel, type Panel } from "@/components/event/itinerary-panel";
import { ItineraryTab } from "@/components/event/itinerary-tab";
import { MomentActionsMenu } from "@/components/event/moment-actions-menu";
import { SettingsTab } from "@/components/event/settings-tab";
import { SharedTab } from "@/components/event/shared-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const search = z.object({
  // Old "moments" links fall back to the itinerary, which now has a card view.
  tab: z.enum(["itinerary", "shared", "activity", "settings"]).default("itinerary").catch("itinerary"),
  groupBy: z.enum(["day", "place", "month", "none"]).default("day").catch("day"),
  view: z.enum(["table", "cards"]).default("table").catch("table"),
  panel: z.enum(["outline", "details", "new-moment", "moment"]).default("outline").catch("outline"),
  momentId: z.string().optional().catch(undefined),
  // YYYY-MM-DD: prefills the date of a new moment added from a day group.
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/e/$id/")({
  validateSearch: search,
  component: EventPage,
});

function EventPage() {
  const { id } = Route.useParams();
  const { tab, groupBy, view, panel, momentId, day } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const eventId = id as Id<"events">;
  const event = useQuery(api.events.get, { eventId });
  const me = useQuery(api.users.getCurrentUser);

  if (event === undefined) return <Skeleton className="h-96 w-full" />;
  if (event === null) return <p className="text-muted-foreground">Experience not found.</p>;

  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const canAdd = event.role !== "viewer" && !archived;
  const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);

  // Every panel sits beside the itinerary, so opening one also shows that tab.
  const openPanel = (next: Panel, nextMomentId?: string, nextDay?: string) =>
    void navigate({
      search: (s) => ({ ...s, tab: "itinerary" as const, panel: next, momentId: nextMomentId, day: nextDay }),
    });

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(t) => void navigate({ search: (s) => ({ ...s, tab: t as typeof tab }) })}>
        {/* Title and description live in the breadcrumb and "Edit details". */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList>
                <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
                {isOwner && <TabsTrigger value="shared">Shared</TabsTrigger>}
                {isOwner && <TabsTrigger value="activity">Activity</TabsTrigger>}
                {isOwner && <TabsTrigger value="settings">Settings</TabsTrigger>}
              </TabsList>
            </div>
            {archived && <Badge variant="secondary">Archived</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {canAdd && (
              <Button onClick={() => openPanel("new-moment")}>
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

        <TabsContent value="itinerary">
          <div className="flex gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <ItineraryTab
                eventId={eventId}
                meId={me?.id}
                grouping={groupBy}
                view={view}
                onGroupingChange={(g) => void navigate({ search: (s) => ({ ...s, groupBy: g }) })}
                onViewChange={(v) => void navigate({ search: (s) => ({ ...s, view: v }) })}
                onAddToDay={canAdd ? (d) => openPanel("new-moment", undefined, d) : undefined}
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
              groupBy={groupBy === "none" ? "day" : groupBy}
              panel={panel}
              momentId={momentId}
              day={day}
              canAdd={canAdd}
              canEditMoment={canEditMoment}
              onNavigate={(next) => openPanel(next.panel, next.momentId)}
            />
          </div>
        </TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="settings"><SettingsTab eventId={eventId} /></TabsContent>}
      </Tabs>
    </div>
  );
}
