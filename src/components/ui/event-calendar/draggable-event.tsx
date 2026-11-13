import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";
import { useRef } from "react";

import { type CalendarEvent, EventItem, useCalendarDnd } from "@/components/ui/event-calendar";

interface DraggableEventProps {
  event: CalendarEvent;
  view: "month" | "week" | "day";
  showTime?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  height?: number;
  isMultiDay?: boolean;
  multiDayWidth?: number;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  // Story-time: how many day columns a month bar covers, and how many days
  // into the event it begins (0 in the week the event starts).
  span?: number;
  offsetDays?: number;
  "aria-hidden"?: boolean | "true" | "false";
}

export function DraggableEvent({
  event,
  view,
  showTime,
  onClick,
  height,
  isMultiDay,
  multiDayWidth,
  isFirstDay = true,
  isLastDay = true,
  span = 1,
  offsetDays = 0,
  "aria-hidden": ariaHidden,
}: DraggableEventProps) {
  const { activeEvent } = useCalendarDnd();
  // Story-time: an event has a bar in every week it spans, so each needs its
  // own id.
  const dragId = `${event.id}-${view}-${offsetDays}`;
  const elementRef = useRef<HTMLDivElement>(null);

  // Check if this is a multi-day event
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  const isMultiDayEvent = isMultiDay || event.allDay || differenceInDays(eventEnd, eventStart) >= 1;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    data: {
      event,
      height: height || elementRef.current?.offsetHeight || null,
      isFirstDay,
      isLastDay,
      isMultiDay: isMultiDayEvent,
      multiDayWidth: multiDayWidth,
      offsetDays,
      span,
      view,
    },
    disabled: event.readOnly,
    id: dragId,
  });

  // Don't render if this event is being dragged (any of its bars)
  if (isDragging || activeEvent?.id === event.id) {
    return <div className="opacity-0" ref={setNodeRef} style={{ height: height || "auto" }} />;
  }

  const style = transform
    ? {
        height: height || "auto",
        transform: CSS.Translate.toString(transform),
        width: isMultiDayEvent && multiDayWidth ? `${multiDayWidth}%` : undefined,
      }
    : {
        height: height || "auto",
        width: isMultiDayEvent && multiDayWidth ? `${multiDayWidth}%` : undefined,
      };

  return (
    <div
      // Story-time: touch-manipulation, not touch-none, so a swipe that starts
      // on an event still scrolls the page (see the sensors).
      className="touch-manipulation"
      ref={(node) => {
        setNodeRef(node);
        if (elementRef) elementRef.current = node;
      }}
      style={style}
    >
      <EventItem
        aria-hidden={ariaHidden}
        // Story-time: a read-only event is a plain button. The drag attributes
        // would mark it aria-disabled though it still opens.
        dndAttributes={event.readOnly ? undefined : attributes}
        dndListeners={listeners}
        event={event}
        isDragging={isDragging}
        isFirstDay={isFirstDay}
        isLastDay={isLastDay}
        onClick={onClick}
        showTime={showTime}
        view={view}
      />
    </div>
  );
}
