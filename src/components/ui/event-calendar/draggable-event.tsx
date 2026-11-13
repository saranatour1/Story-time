import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";

import {
  type CalendarEvent,
  EventItem,
  isMultiDayEvent,
  useCalendarDnd,
} from "@/components/ui/event-calendar";

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
  const dragId = `${event.id}-${view}-${offsetDays}`;
  const elementRef = useRef<HTMLDivElement>(null);

  const spansDays = isMultiDay || isMultiDayEvent(event);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    data: {
      event,
      height: height || elementRef.current?.offsetHeight || null,
      isFirstDay,
      isLastDay,
      isMultiDay: spansDays,
      multiDayWidth: multiDayWidth,
      offsetDays,
      span,
      view,
    },
    disabled: event.readOnly,
    id: dragId,
  });

  if (isDragging || activeEvent?.id === event.id) {
    return <div className="opacity-0" ref={setNodeRef} style={{ height: height || "auto" }} />;
  }

  const style = transform
    ? {
        height: height || "auto",
        transform: CSS.Translate.toString(transform),
        width: spansDays && multiDayWidth ? `${multiDayWidth}%` : undefined,
      }
    : {
        height: height || "auto",
        width: spansDays && multiDayWidth ? `${multiDayWidth}%` : undefined,
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
