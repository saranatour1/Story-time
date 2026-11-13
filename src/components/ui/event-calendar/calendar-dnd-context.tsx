import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { addMinutes, differenceInCalendarDays, differenceInMinutes, subDays } from "date-fns";
import { createContext, type ReactNode, useContext, useId, useState } from "react";

import { type CalendarEvent, EventItem } from "@/components/ui/event-calendar";
import { dayGrabbed } from "@/lib/calendar";

const monthDropsUnderPointerElseOverlap: CollisionDetection = (args) =>
  args.active.data.current?.view === "month" ? pointerWithin(args) : rectIntersection(args);

const atQuarterHour = (day: Date, hourOfDay: number): Date => {
  const hours = Math.floor(hourOfDay);
  const quarter = Math.min(3, Math.round((hourOfDay - hours) * 4));
  const at = new Date(day);
  at.setHours(hours, quarter * 15, 0, 0);
  return at;
};

const atTimeOf = (day: Date, clock: Date): Date => {
  const at = new Date(day);
  at.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds());
  return at;
};

const sameMinute = (a: Date, b: Date): boolean =>
  Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

// Story-time: dnd-kit's defaults tell screen readers to press space to pick an
// event up (there is no keyboard sensor here) and read out raw ids. Say what
// is true, with the event's title and the day it lands on.
const FULL_DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const titleOf = (data: unknown): string =>
  (data as { event?: CalendarEvent } | undefined)?.event?.title ?? "Event";
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${titleOf(active.data.current)}.`,
  onDragOver: () => undefined,
  onDragEnd: ({ active, over }) => {
    const day = (over?.data.current as { date?: Date } | undefined)?.date;
    return day
      ? `${titleOf(active.data.current)} was dropped on ${FULL_DAY.format(day)}.`
      : `${titleOf(active.data.current)} was put back.`;
  },
  onDragCancel: ({ active }) => `${titleOf(active.data.current)} was put back.`,
};
const screenReaderInstructions = {
  draggable: "Press Enter to open. To move it to other dates, drag it with a mouse or by touch.",
};

type CalendarDndContextType = {
  activeEvent: CalendarEvent | null;
  activeId: UniqueIdentifier | null;
  activeView: "month" | "week" | "day" | null;
  draggedStart: Date | null;
  eventHeight: number | null;
  isMultiDay: boolean;
  multiDayWidth: number | null;
};

const CalendarDndContext = createContext<CalendarDndContextType>({
  activeEvent: null,
  activeId: null,
  activeView: null,
  draggedStart: null,
  eventHeight: null,
  isMultiDay: false,
  multiDayWidth: null,
});

export const useCalendarDnd = () => useContext(CalendarDndContext);

interface CalendarDndProviderProps {
  children: ReactNode;
  onEventUpdate: (event: CalendarEvent, daysMoved: number) => void;
}

export function CalendarDndProvider({ children, onEventUpdate }: CalendarDndProviderProps) {
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeView, setActiveView] = useState<"month" | "week" | "day" | null>(null);
  const [draggedStart, setDraggedStart] = useState<Date | null>(null);
  const [eventHeight, setEventHeight] = useState<number | null>(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [multiDayWidth, setMultiDayWidth] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    // Story-time: no PointerSensor. It takes touches too and starts a drag
    // after 5px, so a swipe that began on a bar moved the trip. On touch a
    // drag now needs a press and hold; a swipe scrolls the page.
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
  );

  const dndContextId = useId();

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    if (!active.data.current) {
      console.error("Missing data in drag start event", event);
      return;
    }

    const {
      event: calendarEvent,
      view,
      height,
      isMultiDay: eventIsMultiDay,
      multiDayWidth: eventMultiDayWidth,
    } = active.data.current as {
      event: CalendarEvent;
      view: "month" | "week" | "day";
      height?: number;
      isMultiDay?: boolean;
      multiDayWidth?: number;
    };

    setActiveEvent(calendarEvent);
    setActiveId(active.id);
    setActiveView(view);
    setDraggedStart(new Date(calendarEvent.start));
    setIsMultiDay(eventIsMultiDay || false);
    setMultiDayWidth(eventMultiDayWidth || null);

    if (height) setEventHeight(height);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (over && activeEvent && over.data.current) {
      const { date, hourOfDay } = over.data.current as { date: Date; hourOfDay?: number };

      let hovered: Date | undefined;
      if (hourOfDay !== undefined && activeView !== "month") {
        hovered = atQuarterHour(date, hourOfDay);
      } else if (activeView === "month") {
        hovered = draggedStart ? atTimeOf(date, draggedStart) : new Date(date);
      }
      if (hovered && !(draggedStart && sameMinute(hovered, draggedStart))) {
        setDraggedStart(hovered);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !activeEvent || !draggedStart) {
      setActiveEvent(null);
      setActiveId(null);
      setActiveView(null);
      setDraggedStart(null);
      setEventHeight(null);
      setIsMultiDay(false);
      setMultiDayWidth(null);
      return;
    }

    try {
      if (!active.data.current || !over.data.current) {
        throw new Error("Missing data in drag event");
      }

      const activeData = active.data.current as {
        event?: CalendarEvent;
        view?: string;
        span?: number;
        offsetDays?: number;
      };
      const overData = over.data.current as { date?: Date; hourOfDay?: number };

      if (!activeData.event || !overData.date) {
        throw new Error("Missing required event data");
      }

      const calendarEvent = activeData.event;
      const date = overData.date;
      const originalStart = new Date(calendarEvent.start);

      let newStart: Date;
      if (overData.hourOfDay !== undefined) {
        newStart = atQuarterHour(date, overData.hourOfDay);
      } else {
        const bar = active.rect.current.initial;
        const grabbed = getEventCoordinates(event.activatorEvent);
        const grabbedDayOfEvent =
          (activeData.offsetDays ?? 0) +
          (bar && grabbed ? dayGrabbed(grabbed.x, bar.left, bar.width, activeData.span ?? 1) : 0);
        newStart = atTimeOf(subDays(date, grabbedDayOfEvent), originalStart);
      }

      if (!sameMinute(newStart, originalStart)) {
        const durationMinutes = differenceInMinutes(new Date(calendarEvent.end), originalStart);
        onEventUpdate(
          { ...calendarEvent, end: addMinutes(newStart, durationMinutes), start: newStart },
          differenceInCalendarDays(newStart, originalStart),
        );
      }
    } catch (error) {
      console.error("Error in drag end handler:", error);
    } finally {
      setActiveEvent(null);
      setActiveId(null);
      setActiveView(null);
      setDraggedStart(null);
      setEventHeight(null);
      setIsMultiDay(false);
      setMultiDayWidth(null);
    }
  };

  return (
    <DndContext
      accessibility={{ announcements, screenReaderInstructions }}
      collisionDetection={monthDropsUnderPointerElseOverlap}
      id={dndContextId}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <CalendarDndContext.Provider
        value={{
          activeEvent,
          activeId,
          activeView,
          draggedStart,
          eventHeight,
          isMultiDay,
          multiDayWidth,
        }}
      >
        {children}

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeEvent && activeView && (
            <div
              style={{
                height: eventHeight ? `${eventHeight}px` : "auto",
                width: isMultiDay && multiDayWidth ? `${multiDayWidth}%` : "100%",
              }}
            >
              <EventItem
                draggedStart={draggedStart || undefined}
                event={activeEvent}
                isDragging={true}
                showTime={activeView !== "month"}
                view={activeView}
              />
            </div>
          )}
        </DragOverlay>
      </CalendarDndContext.Provider>
    </DndContext>
  );
}
