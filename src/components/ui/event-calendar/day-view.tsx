import {
  addHours,
  eachHourOfInterval,
  format,
  getHours,
  isSameDay,
  startOfDay,
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
import { EndHour, StartHour } from "@/components/ui/event-calendar/constants";
import { cn } from "@/lib/utils";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function DayView({ currentDate, events, onEventSelect, onEventCreate }: DayViewProps) {
  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      end: addHours(dayStart, EndHour - 1),
      start: addHours(dayStart, StartHour),
    });
  }, [currentDate]);

  const dayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return (
          isSameDay(currentDate, eventStart) ||
          isSameDay(currentDate, eventEnd) ||
          (currentDate > eventStart && currentDate < eventEnd)
        );
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [currentDate, events]);

  const allDayEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      return event.allDay || isMultiDayEvent(event);
    });
  }, [dayEvents]);

  const timeEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      return !event.allDay && !isMultiDayEvent(event);
    });
  }, [dayEvents]);

  const positionedEvents = useMemo(
    () => positionTimedEvents(currentDate, timeEvents),
    [currentDate, timeEvents],
  );

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const showAllDaySection = allDayEvents.length > 0;
  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(currentDate, "day");

  return (
    <div className="contents" data-slot="day-view">
      {showAllDaySection && (
        <div className="border-border/70 border-t bg-muted/50">
          <div className="grid grid-cols-[3rem_1fr] sm:grid-cols-[4rem_1fr]">
            <div className="relative">
              <span className="absolute bottom-0 left-0 h-6 w-16 max-w-full pe-2 text-right text-[10px] text-muted-foreground/70 sm:pe-4 sm:text-xs">
                All day
              </span>
            </div>
            <div className="relative border-border/70 border-r p-1 last:border-r-0">
              {allDayEvents.map((event) => {
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                const isFirstDay = isSameDay(currentDate, eventStart);
                const isLastDay = isSameDay(currentDate, eventEnd);

                return (
                  <EventItem
                    event={event}
                    isFirstDay={isFirstDay}
                    isLastDay={isLastDay}
                    key={`spanning-${event.id}`}
                    onClick={(e) => handleEventClick(event, e)}
                    view="month"
                  >
                    <div>{event.title}</div>
                  </EventItem>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-[3rem_1fr] overflow-hidden border-border/70 border-t sm:grid-cols-[4rem_1fr]">
        <div>
          {hours.map((hour, index) => (
            <div
              className="relative h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
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

        <div className="relative">
          {positionedEvents.map((positionedEvent) => (
            <div
              className="absolute z-10 px-0.5"
              key={positionedEvent.event.id}
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
                  view="day"
                />
              </div>
            </div>
          ))}

          {currentTimeVisible && (
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
                className="relative h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
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
                      date={currentDate}
                      id={`day-cell-${currentDate.toISOString()}-${quarterHourTime}`}
                      key={`${hour.toString()}-${quarter}`}
                      onClick={() => {
                        const startTime = new Date(currentDate);
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
      </div>
    </div>
  );
}
