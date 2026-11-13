import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  getHours,
  getMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";

import type { CalendarEvent, EventColor } from "@/components/ui/event-calendar";
import { StartHour, WeekCellsHeight } from "@/components/ui/event-calendar/constants";

export function getEventColorClasses(color?: EventColor | string): string {
  const eventColor = color || "sky";

  switch (eventColor) {
    case "sky":
      return "bg-sky-200/50 hover:bg-sky-200/40 text-sky-950/80 dark:bg-sky-400/25 dark:hover:bg-sky-400/20 dark:text-sky-200 shadow-sky-700/8";
    case "amber":
      return "bg-amber-200/50 hover:bg-amber-200/40 text-amber-950/80 dark:bg-amber-400/25 dark:hover:bg-amber-400/20 dark:text-amber-200 shadow-amber-700/8";
    case "violet":
      return "bg-violet-200/50 hover:bg-violet-200/40 text-violet-950/80 dark:bg-violet-400/25 dark:hover:bg-violet-400/20 dark:text-violet-200 shadow-violet-700/8";
    case "rose":
      return "bg-rose-200/50 hover:bg-rose-200/40 text-rose-950/80 dark:bg-rose-400/25 dark:hover:bg-rose-400/20 dark:text-rose-200 shadow-rose-700/8";
    case "emerald":
      return "bg-emerald-200/50 hover:bg-emerald-200/40 text-emerald-950/80 dark:bg-emerald-400/25 dark:hover:bg-emerald-400/20 dark:text-emerald-200 shadow-emerald-700/8";
    case "orange":
      return "bg-orange-200/50 hover:bg-orange-200/40 text-orange-950/80 dark:bg-orange-400/25 dark:hover:bg-orange-400/20 dark:text-orange-200 shadow-orange-700/8";
    default:
      return "bg-sky-200/50 hover:bg-sky-200/40 text-sky-950/80 dark:bg-sky-400/25 dark:hover:bg-sky-400/20 dark:text-sky-200 shadow-sky-700/8";
  }
}

export function getBorderRadiusClasses(isFirstDay: boolean, isLastDay: boolean): string {
  if (isFirstDay && isLastDay) {
    return "rounded";
  }
  if (isFirstDay) {
    return "rounded-l rounded-r-none";
  }
  if (isLastDay) {
    return "rounded-r rounded-l-none";
  }
  return "rounded-none";
}

export function isMultiDayEvent(event: CalendarEvent): boolean {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  return event.allDay || eventStart.getDate() !== eventEnd.getDate();
}

export function agendaEventsOn(
  events: CalendarEvent[],
  day: Date,
  isFirstDayShown: boolean,
): CalendarEvent[] {
  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const startsThatDay = isSameDay(day, eventStart);
      const stillRunning = isSameDay(day, eventEnd) || (day > eventStart && day < eventEnd);
      return startsThatDay || (isFirstDayShown && stillRunning);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function positionTimedEvents(day: Date, timedEvents: CalendarEvent[]): PositionedEvent[] {
  const sortedEvents = [...timedEvents].sort((a, b) => {
    const aStart = new Date(a.start);
    const bStart = new Date(b.start);
    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;
    return (
      differenceInMinutes(new Date(b.end), bStart) - differenceInMinutes(new Date(a.end), aStart)
    );
  });

  const dayStart = startOfDay(day);
  const columns: CalendarEvent[][] = [];

  return sortedEvents.map((event) => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
    const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);
    const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
    const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

    const overlapsColumn = (column: CalendarEvent[]) =>
      column.some((placed) =>
        areIntervalsOverlapping(
          { end: adjustedEnd, start: adjustedStart },
          { end: new Date(placed.end), start: new Date(placed.start) },
        ),
      );
    const firstFree = columns.findIndex((column) => !overlapsColumn(column));
    const columnIndex = firstFree === -1 ? columns.length : firstFree;
    (columns[columnIndex] ??= []).push(event);

    return {
      event,
      height: (endHour - startHour) * WeekCellsHeight,
      left: columnIndex === 0 ? 0 : columnIndex * 0.1,
      top: (startHour - StartHour) * WeekCellsHeight,
      width: columnIndex === 0 ? 1 : 0.9,
      zIndex: 10 + columnIndex,
    };
  });
}
