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

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const FULL_DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

const MIN_LANES = 3;
// Grid rows count from 1, and the first holds the day numbers.
const FIRST_LANE_ROW = 2;

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function MonthView({ currentDate, events, onEventSelect, onEventCreate }: MonthViewProps) {
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const days = eachDayOfInterval({
      end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: WeekStartsOn }),
      start: startOfWeek(monthStart, { weekStartsOn: WeekStartsOn }),
    });
    return Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  }, [currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(startOfWeek(new Date(), { weekStartsOn: WeekStartsOn }), i);
      return WEEKDAY.format(date);
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
          <div className="py-2 text-center text-muted-foreground/70 text-sm" key={day}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week) => {
          const bars = weekBars(week, events);
          const lanes = Math.max(MIN_LANES, ...bars.map((bar) => bar.lane + 1));

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
                    <time
                      aria-label={FULL_DAY.format(day)}
                      className="mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm group-data-today:bg-primary group-data-today:text-primary-foreground"
                      dateTime={format(day, "yyyy-MM-dd")}
                    >
                      {day.getDate()}
                    </time>
                  </DroppableCell>
                </div>
              ))}
              {bars.map(({ event, col, span, lane, startsThisWeek, endsThisWeek }) => (
                <div
                  className={cn("min-w-0", startsThisWeek && "ms-1", endsThisWeek && "me-1")}
                  key={event.id}
                  style={{
                    gridColumn: `${col + 1} / span ${span}`,
                    gridRow: lane + FIRST_LANE_ROW,
                  }}
                >
                  <DraggableEvent
                    event={event}
                    isFirstDay={startsThisWeek}
                    isLastDay={endsThisWeek}
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
