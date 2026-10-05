import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { PlayIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActivityTab } from "@/components/event/activity-tab";
import { EventActionsMenu } from "@/components/event/event-actions-menu";
import { EditorPanel, MomentFeed, type Panel } from "@/components/event/itinerary-panel";
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
  // The table's visible moments, in its order; the feed follows it.
  const [order, setOrder] = useState<string[] | null>(null);
  // Scrolling the feed selects the moment in view, without new history
  // entries. `resetScroll: false` stops the router restoring the feed's old
  // scroll position (and the window's) after each of these navigations.
  const onActiveChange = useCallback(
    (mid: string) =>
      void navigate({ search: (s) => ({ ...s, momentId: mid }), replace: true, resetScroll: false }),
    [navigate],
  );

  if (event === undefined) return <Skeleton className="h-96 w-full" />;
  if (event === null) return <p className="text-muted-foreground">Experience not found.</p>;

  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  const canAdd = event.role !== "viewer" && !archived;
  const canEditMoment = (authorId: string) => !archived && (isOwner || authorId === me?.id);

  // Editors open under the itinerary, so opening one also shows that tab.
  // `momentId` is the moment in the preview; editing one also selects it.
  const openPanel = (next: Panel, nextMomentId?: string, nextDay?: string) =>
    void navigate({
      search: (s) => ({
        ...s,
        tab: "itinerary" as const,
        panel: next,
        momentId: nextMomentId ?? (next === "outline" ? s.momentId : undefined),
        day: nextDay,
      }),
    });
  const selectMoment = (mid: string) =>
    void navigate({ search: (s) => ({ ...s, tab: "itinerary" as const, momentId: mid }), resetScroll: false });

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
            {event.momentCount > 0 && (
              <Button variant="outline" asChild>
                {/* Starts at the selected moment, if there is one. */}
                <Link to="/e/$id/story" params={{ id }} search={{ step: 0, momentId }}>
                  <PlayIcon /> Play story
                </Link>
              </Button>
            )}
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
          {/* Left: the itinerary, with any open editor under it. Right: the
              selected moment, stop by stop. Stacked on narrow screens. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex w-full min-w-0 flex-col gap-4 lg:w-[28rem] lg:shrink-0">
              <ItineraryTab
                eventId={eventId}
                meId={me?.id}
                grouping={groupBy}
                view={view}
                onGroupingChange={(g) => void navigate({ search: (s) => ({ ...s, groupBy: g }) })}
                onViewChange={(v) => void navigate({ search: (s) => ({ ...s, view: v }) })}
                onAddToDay={canAdd ? (d) => openPanel("new-moment", undefined, d) : undefined}
                onOrderChange={setOrder}
                selectedMomentId={momentId}
                onSelectMoment={selectMoment}
                renderActions={(m) => (
                  <MomentActionsMenu
                    eventId={eventId}
                    moment={m}
                    canEdit={canEditMoment(m.authorId)}
                    onEdit={() => openPanel("moment", m._id)}
                    onDeleted={() => {
                      if (momentId === m._id) {
                        void navigate({ search: (s) => ({ ...s, panel: "outline" as const, momentId: undefined }) });
                      }
                    }}
                  />
                )}
              />
              {panel !== "outline" && (
                <EditorPanel
                  event={event}
                  panel={panel}
                  momentId={momentId}
                  day={day}
                  canEditMoment={canEditMoment}
                  onClose={() => openPanel("outline")}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <MomentFeed
                event={event}
                order={order}
                momentId={momentId}
                meId={me?.id}
                canAdd={canAdd}
                canEditMoment={canEditMoment}
                onEdit={(mid) => openPanel("moment", mid)}
                onAdd={() => openPanel("new-moment")}
                onActiveChange={onActiveChange}
              />
            </div>
          </div>
        </TabsContent>
        {isOwner && <TabsContent value="shared"><SharedTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="activity"><ActivityTab eventId={eventId} /></TabsContent>}
        {isOwner && <TabsContent value="settings"><SettingsTab eventId={eventId} /></TabsContent>}
      </Tabs>
    </div>
  );
}
