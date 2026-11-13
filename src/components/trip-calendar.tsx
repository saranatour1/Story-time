import { useMutation } from "convex/react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type Trip, TripPeek } from "@/components/trip-peek";
import { type CalendarEvent, EventCalendar, type EventColor } from "@/components/ui/event-calendar";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

const COLORS: EventColor[] = ["amber", "sky", "violet", "rose", "emerald", "orange"];

// A trip keeps its colour from one visit to the next: it comes from the id.
const colorOf = (id: string): EventColor =>
  COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length] ?? "amber";

const shift = (ms: number | undefined, days: number) =>
  ms === undefined ? undefined : addDays(ms, days).getTime();

// The experiences on coss's event calendar (month, week, day, agenda). A trip
// covers every day from its start to its end, or the one day it has; trips
// with no dates are only in the grid. Clicking a trip shows what it holds
// (TripPeek); its owner can drag it to new dates in the month view.
export const TripCalendar = ({ trips }: { trips: Trip[] }) => {
  const [peekId, setPeekId] = useState<string | null>(null);
  const peeked = trips.find((trip) => trip._id === peekId);
  // The bar stays where it was dropped while the save is on its way.
  const update = useMutation(api.events.update).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.events.listMine, {});
    if (now === undefined) return;
    store.setQuery(
      api.events.listMine,
      {},
      now.map((trip) =>
        trip._id === args.eventId
          ? {
              ...trip,
              startsAt: args.startsAt ?? trip.startsAt,
              endsAt: args.endsAt ?? trip.endsAt,
            }
          : trip,
      ),
    );
  });

  // Kept between renders, so opening the preview doesn't lay the views out again.
  const events = useMemo(
    () =>
      trips.flatMap((trip): CalendarEvent[] => {
        const start = trip.startsAt ?? trip.endsAt;
        if (start === undefined) return [];
        return [
          {
            id: trip._id,
            title: trip.title,
            start: new Date(start),
            end: new Date(trip.endsAt ?? start),
            allDay: true,
            color: colorOf(trip._id),
            readOnly: trip.role !== "owner",
          },
        ];
      }),
    [trips],
  );

  // Trips are whole days: move both dates by the days dragged, whatever time
  // of day the calendar reports, so they stay at local midnight.
  const move = async (moved: CalendarEvent) => {
    const trip = trips.find((t) => t._id === moved.id);
    const from = trip?.startsAt ?? trip?.endsAt;
    if (trip === undefined || from === undefined) return;
    const days = differenceInCalendarDays(moved.start, from);
    if (days === 0) return;
    const save = (by: number) =>
      update({
        eventId: trip._id,
        startsAt: shift(trip.startsAt, by),
        endsAt: shift(trip.endsAt, by),
      });
    try {
      await save(days);
      // A drag is easy to make by accident, so the way back is one click. One
      // toast per trip: a later move replaces this Undo, which would otherwise
      // put the trip back two moves and lose the later one.
      toast.success(`Moved "${trip.title}"`, {
        id: `moved-${trip._id}`,
        action: {
          label: "Undo",
          onClick: () => void save(0).catch((e) => toast.error(errorMessage(e))),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <section aria-label="Calendar">
      <EventCalendar
        events={events}
        onEventSelect={(event) => setPeekId(event.id)}
        onEventUpdate={(event) => void move(event)}
      />
      {peeked && <TripPeek trip={peeked} onClose={() => setPeekId(null)} />}
    </section>
  );
};
