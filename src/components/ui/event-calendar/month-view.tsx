import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type React from "react";
import { useMemo } from "react";

import {
  type CalendarEvent,
  DraggableEvent,
  DroppableCell,
  WeekStartsOn,
} from "@/components/ui/event-calendar";
import { DefaultStartHour } from "@/components/ui/event-calendar/constants";
import { weekBars } from "@/lib/calendar";
import { cn } from "@/lib/utils";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function MonthView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
}: MonthViewProps) {
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const days = eachDayOfInterval({
      end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: WeekStartsOn }),
      start: startOfWeek(monthStart, { weekStartsOn: WeekStartsOn }),
    });
    return Array.from({ length: days.length / 7 }, (_, i) =>
      days.slice(i * 7, i * 7 + 7),
    );
  }, [currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(
        startOfWeek(new Date(), { weekStartsOn: WeekStartsOn }),
        i,
      );
      return format(date, "EEE");
    });
  }, []);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  return (
    <div className="contents" data-slot="month-view">
      <div className="grid grid-cols-7 border-border/70 border-b">
        {weekdays.map((day) => (
          <div
            className="py-2 text-center text-muted-foreground/70 text-sm"
            key={day}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week) => {
          // Story-time: coss draws a button per event per day, which breaks a
          // trip into pieces that change row and lose their title. Here each
          // event is one bar per week, laid over the day cells: the cells
          // fill every row of the week's grid, the bars take a row each.
          const bars = weekBars(week, events);
          // Room for three at once; a busier week grows to show them all.
          const lanes = Math.max(3, ...bars.map((bar) => bar.lane + 1));

          return (
            <div
              className="grid grid-cols-7 [&:last-child>*]:border-b-0"
              key={`week-${week[0]}`}
              style={{
                gridTemplateRows: `2rem repeat(${lanes}, calc(var(--event-height) + var(--event-gap))) minmax(var(--event-gap), 1fr)`,
              }}
            >
              {week.map((day, dayIndex) => (
                <div
                  className="group border-border/70 border-r border-b nth-7:border-r-0 data-outside-cell:bg-muted/25 data-outside-cell:text-muted-foreground/70"
                  data-outside-cell={!isSameMonth(day, currentDate) || undefined}
                  data-today={isToday(day) || undefined}
                  key={day.toString()}
                  style={{ gridColumn: dayIndex + 1, gridRow: "1 / -1" }}
                >
                  <DroppableCell
                    date={day}
                    id={`month-cell-${day.toISOString()}`}
                    onClick={() => {
                      const startTime = new Date(day);
                      startTime.setHours(DefaultStartHour, 0, 0);
                      onEventCreate(startTime);
                    }}
                  >
                    <div className="mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm group-data-today:bg-primary group-data-today:text-primary-foreground">
                      {format(day, "d")}
                    </div>
                  </DroppableCell>
                </div>
              ))}
              {bars.map(({ event, col, span, lane, starts, ends }) => (
                <div
                  // Flush with the week's edge where the event carries on.
                  className={cn("min-w-0", starts && "ms-1", ends && "me-1")}
                  key={event.id}
                  style={{
                    gridColumn: `${col + 1} / span ${span}`,
                    gridRow: lane + 2,
                  }}
                >
                  <DraggableEvent
                    event={event}
                    isFirstDay={starts}
                    isLastDay={ends}
                    offsetDays={Math.max(
                      0,
                      differenceInCalendarDays(week[col] ?? event.start, event.start),
                    )}
                    onClick={(e) => handleEventClick(event, e)}
                    span={span}
                    view="month"
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
