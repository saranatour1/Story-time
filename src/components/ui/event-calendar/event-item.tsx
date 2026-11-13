import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { differenceInMinutes, format, getMinutes, isPast, isSameDay } from "date-fns";
import { useMemo } from "react";

import {
  type CalendarEvent,
  getBorderRadiusClasses,
  getEventColorClasses,
} from "@/components/ui/event-calendar";
import { cn } from "@/lib/utils";

const DAYS = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const formatTimeWithOptionalMinutes = (date: Date) => {
  return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
};

interface EventWrapperProps {
  event: CalendarEvent;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
  displayEnd: Date;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
}

function EventWrapper({
  event,
  isFirstDay = true,
  isLastDay = true,
  isDragging,
  onClick,
  className,
  children,
  displayEnd,
  dndListeners,
  dndAttributes,
}: EventWrapperProps) {
  const isEventInPast = isPast(displayEnd);

  return (
    <button
      className={cn(
        "flex size-full select-none overflow-hidden px-1 text-left font-medium outline-none backdrop-blur-md transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-dragging:cursor-grabbing data-dragging:shadow-lg sm:px-2",
        getEventColorClasses(event.color),
        getBorderRadiusClasses(isFirstDay, isLastDay),
        className,
      )}
      data-dragging={isDragging || undefined}
      data-past-event={isEventInPast || undefined}
      onClick={onClick}
      type="button"
      {...dndListeners}
      {...dndAttributes}
    >
      {children}
    </button>
  );
}

interface EventItemProps {
  event: CalendarEvent;
  view: "month" | "week" | "day" | "agenda";
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  showTime?: boolean;
  draggedStart?: Date;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  children?: React.ReactNode;
  className?: string;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
}

export function EventItem({
  event,
  view,
  isDragging,
  onClick,
  showTime,
  draggedStart,
  isFirstDay = true,
  isLastDay = true,
  children,
  className,
  dndListeners,
  dndAttributes,
}: EventItemProps) {
  const eventColor = event.color;

  const displayStart = useMemo(() => {
    return draggedStart || new Date(event.start);
  }, [draggedStart, event.start]);

  const displayEnd = useMemo(() => {
    return draggedStart
      ? new Date(
          new Date(draggedStart).getTime() +
            (new Date(event.end).getTime() - new Date(event.start).getTime()),
        )
      : new Date(event.end);
  }, [draggedStart, event.start, event.end]);

  const durationMinutes = useMemo(() => {
    return differenceInMinutes(displayEnd, displayStart);
  }, [displayStart, displayEnd]);

  const getEventTime = () => {
    if (event.allDay) return "All day";

    if (durationMinutes < 45) {
      return formatTimeWithOptionalMinutes(displayStart);
    }

    return `${formatTimeWithOptionalMinutes(displayStart)} - ${formatTimeWithOptionalMinutes(displayEnd)}`;
  };

  if (view === "month") {
    return (
      <EventWrapper
        className={cn(
          "mt-[var(--event-gap)] h-[var(--event-height)] items-center text-[10px] sm:text-xs",
          className,
        )}
        displayEnd={displayEnd}
        dndAttributes={dndAttributes}
        dndListeners={dndListeners}
        event={event}
        isDragging={isDragging}
        isFirstDay={isFirstDay}
        isLastDay={isLastDay}
        onClick={onClick}
      >
        {children || (
          <span className="truncate">
            {!event.allDay && (
              <span className="truncate font-normal opacity-70 sm:text-[11px]">
                {formatTimeWithOptionalMinutes(displayStart)}{" "}
              </span>
            )}
            {event.title}
          </span>
        )}
      </EventWrapper>
    );
  }

  if (view === "week" || view === "day") {
    return (
      <EventWrapper
        className={cn(
          "py-1",
          durationMinutes < 45 ? "items-center" : "flex-col",
          view === "week" ? "text-[10px] sm:text-xs" : "text-xs",
          className,
        )}
        displayEnd={displayEnd}
        dndAttributes={dndAttributes}
        dndListeners={dndListeners}
        event={event}
        isDragging={isDragging}
        isFirstDay={isFirstDay}
        isLastDay={isLastDay}
        onClick={onClick}
      >
        {durationMinutes < 45 ? (
          <div className="truncate">
            {event.title}{" "}
            {showTime && (
              <span className="opacity-70">{formatTimeWithOptionalMinutes(displayStart)}</span>
            )}
          </div>
        ) : (
          <>
            <div className="truncate font-medium">{event.title}</div>
            {showTime && (
              <div className="truncate font-normal opacity-70 sm:text-[11px]">{getEventTime()}</div>
            )}
          </>
        )}
      </EventWrapper>
    );
  }

  return (
    <button
      className={cn(
        "flex w-full flex-col gap-1 rounded p-2 text-left outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-past-event:opacity-90",
        getEventColorClasses(eventColor),
        className,
      )}
      data-past-event={isPast(new Date(event.end)) || undefined}
      onClick={onClick}
      type="button"
      {...dndListeners}
      {...dndAttributes}
    >
      <div className="font-medium text-sm">{event.title}</div>
      <div className="text-xs opacity-70">
        {event.allDay ? (
          <span>
            {isSameDay(displayStart, displayEnd)
              ? "All day"
              : DAYS.formatRange(displayStart, displayEnd)}
          </span>
        ) : (
          <span className="uppercase">
            {formatTimeWithOptionalMinutes(displayStart)} -{" "}
            {formatTimeWithOptionalMinutes(displayEnd)}
          </span>
        )}
        {event.location && (
          <>
            <span className="px-1 opacity-35"> · </span>
            <span>{event.location}</span>
          </>
        )}
      </div>
      {event.description && <div className="my-1 text-xs opacity-90">{event.description}</div>}
    </button>
  );
}
