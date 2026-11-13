import {
  addHours,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type React from "react";
import { useMemo } from "react";

import {
  type CalendarEvent,
  positionTimedEvents,
  DraggableEvent,
  DroppableCell,
  EventItem,
  isMultiDayEvent,
  useCurrentTimeIndicator,
} from "@/components/ui/event-calendar";
import { EndHour, StartHour, WeekStartsOn } from "@/components/ui/event-calendar/constants";
import { weekBars } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const NARROW_WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function WeekView({ currentDate, events, onEventSelect, onEventCreate }: WeekViewProps) {
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: WeekStartsOn });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: WeekStartsOn });
    return eachDayOfInterval({ end: weekEnd, start: weekStart });
  }, [currentDate]);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      end: addHours(dayStart, EndHour - 1),
      start: addHours(dayStart, StartHour),
    });
  }, [currentDate]);

  const allDayEvents = useMemo(() => {
    return events
      .filter((event) => {
        return event.allDay || isMultiDayEvent(event);
      })
      .filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return days.some(
          (day) =>
            isSameDay(day, eventStart) ||
            isSameDay(day, eventEnd) ||
            (day > eventStart && day < eventEnd),
        );
      });
  }, [events, days]);

  const processedDayEvents = useMemo(() => {
    const result = days.map((day) => {
      const dayEvents = events.filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        return (
          isSameDay(day, eventStart) ||
          isSameDay(day, eventEnd) ||
          (eventStart < day && eventEnd > day)
        );
      });

      return positionTimedEvents(day, dayEvents);
    });

    return result;
  }, [days, events]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const showAllDaySection = allDayEvents.length > 0;
  const allDayBars = weekBars(days, allDayEvents);
  const allDayLanes = Math.max(1, ...allDayBars.map((bar) => bar.lane + 1));
  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(currentDate, "week");

  return (
    <div className="flex h-full flex-col" data-slot="week-view">
      <div className="sticky top-0 z-30 grid grid-cols-8 border-border/70 border-b bg-background/80 backdrop-blur-md">
        <div className="py-2 text-center text-muted-foreground/70 text-sm">
          <span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
        </div>
        {days.map((day) => (
          <div
            className="py-2 text-center text-muted-foreground/70 text-sm data-today:font-medium data-today:text-foreground"
            data-today={isToday(day) || undefined}
            key={day.toString()}
          >
            <span aria-hidden="true" className="sm:hidden">
              {NARROW_WEEKDAY.format(day)} {day.getDate()}
            </span>
            <span className="max-sm:hidden">
              {WEEKDAY.format(day)} {format(day, "dd")}
            </span>
          </div>
        ))}
      </div>

      {showAllDaySection && (
        <div className="border-border/70 border-b bg-muted/50">
          <div
            className="grid grid-cols-8"
            style={{
              gridTemplateRows: `repeat(${allDayLanes}, calc(var(--event-height) + var(--event-gap))) var(--event-gap)`,
            }}
          >
            <div
              className="relative border-border/70 border-r"
              style={{ gridColumn: 1, gridRow: "1 / -1" }}
            >
              <span className="absolute bottom-0 left-0 h-6 w-16 max-w-full pe-2 text-right text-[10px] text-muted-foreground/70 sm:pe-4 sm:text-xs">
                All day
              </span>
            </div>
            {days.map((day, dayIndex) => (
              <div
                className="border-border/70 border-r nth-8:border-r-0"
                data-today={isToday(day) || undefined}
                key={day.toString()}
                style={{ gridColumn: dayIndex + 2, gridRow: "1 / -1" }}
              />
            ))}
            {allDayBars.map(({ event, col, span, lane, startsThisWeek, endsThisWeek }) => (
              <div
                className={cn("min-w-0", startsThisWeek && "ms-1", endsThisWeek && "me-1")}
                key={event.id}
                style={{
                  gridColumn: `${col + 2} / span ${span}`,
                  gridRow: lane + 1,
                }}
              >
                <EventItem
                  event={event}
                  isFirstDay={startsThisWeek}
                  isLastDay={endsThisWeek}
                  onClick={(e) => handleEventClick(event, e)}
                  view="month"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-8 overflow-hidden">
        <div className="grid auto-cols-fr border-border/70 border-r">
          {hours.map((hour, index) => (
            <div
              className="relative min-h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
              key={hour.toString()}
            >
              {index > 0 && (
                <span className="-top-3 absolute left-0 flex h-6 w-16 max-w-full items-center justify-end bg-background pe-2 text-[10px] text-muted-foreground/70 sm:pe-4 sm:text-xs">
                  {format(hour, "h a")}
                </span>
              )}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => (
          <div
            className="relative grid auto-cols-fr border-border/70 border-r last:border-r-0"
            data-today={isToday(day) || undefined}
            key={day.toString()}
          >
            {(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
              <div
                className="absolute z-10 px-0.5"
                key={positionedEvent.event.id}
                onClick={(e) => e.stopPropagation()}
                style={{
                  height: `${positionedEvent.height}px`,
                  left: `${positionedEvent.left * 100}%`,
                  top: `${positionedEvent.top}px`,
                  width: `${positionedEvent.width * 100}%`,
                  zIndex: positionedEvent.zIndex,
                }}
              >
                <div className="size-full">
                  <DraggableEvent
                    event={positionedEvent.event}
                    height={positionedEvent.height}
                    onClick={(e) => handleEventClick(positionedEvent.event, e)}
                    showTime
                    view="week"
                  />
                </div>
              </div>
            ))}

            {currentTimeVisible && isToday(day) && (
              <div
                className="pointer-events-none absolute right-0 left-0 z-20"
                style={{ top: `${currentTimePosition}%` }}
              >
                <div className="relative flex items-center">
                  <div className="-left-1 absolute h-2 w-2 rounded-full bg-primary" />
                  <div className="h-[2px] w-full bg-primary" />
                </div>
              </div>
            )}
            {hours.map((hour) => {
              const hourValue = getHours(hour);
              return (
                <div
                  className="relative min-h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
                  key={hour.toString()}
                >
                  {[0, 1, 2, 3].map((quarter) => {
                    const quarterHourTime = hourValue + quarter * 0.25;
                    return (
                      <DroppableCell
                        className={cn(
                          "absolute h-[calc(var(--week-cells-height)/4)] w-full",
                          quarter === 0 && "top-0",
                          quarter === 1 && "top-[calc(var(--week-cells-height)/4)]",
                          quarter === 2 && "top-[calc(var(--week-cells-height)/4*2)]",
                          quarter === 3 && "top-[calc(var(--week-cells-height)/4*3)]",
                        )}
                        date={day}
                        id={`week-cell-${day.toISOString()}-${quarterHourTime}`}
                        key={`${hour.toString()}-${quarter}`}
                        onClick={() => {
                          const startTime = new Date(day);
                          startTime.setHours(hourValue);
                          startTime.setMinutes(quarter * 15);
                          onEventCreate(startTime);
                        }}
                        hourOfDay={quarterHourTime}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
