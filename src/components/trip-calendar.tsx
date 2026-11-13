import { useMutation } from "convex/react";
import { addDays } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type Trip, TripPeek } from "@/components/trip-peek";
import { type CalendarEvent, EventCalendar, type EventColor } from "@/components/ui/event-calendar";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

const COLORS: EventColor[] = ["amber", "sky", "violet", "rose", "emerald", "orange"];

const colorOf = (id: string): EventColor =>
  COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length] ?? "amber";

const undoToastFor = (tripId: string) => `moved-${tripId}`;

const shift = (ms: number | undefined, days: number) =>
  ms === undefined ? undefined : addDays(ms, days).getTime();

export const TripCalendar = ({ trips }: { trips: Trip[] }) => {
  const [peekId, setPeekId] = useState<string | null>(null);
  const peeked = trips.find((trip) => trip._id === peekId);
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

  const move = async (moved: CalendarEvent, daysMoved: number) => {
    const trip = trips.find((t) => t._id === moved.id);
    if (trip === undefined || daysMoved === 0) return;
    const datesBefore = { eventId: trip._id, startsAt: trip.startsAt, endsAt: trip.endsAt };
    const datesAfter = {
      eventId: trip._id,
      startsAt: shift(trip.startsAt, daysMoved),
      endsAt: shift(trip.endsAt, daysMoved),
    };
    try {
      await update(datesAfter);
      toast.success(`Moved "${trip.title}"`, {
        id: undoToastFor(trip._id),
        action: {
          label: "Undo",
          onClick: () => void update(datesBefore).catch((e) => toast.error(errorMessage(e))),
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
        onEventUpdate={(event, daysMoved) => void move(event, daysMoved)}
      />
      {peeked && <TripPeek trip={peeked} onClose={() => setPeekId(null)} />}
    </section>
  );
};
