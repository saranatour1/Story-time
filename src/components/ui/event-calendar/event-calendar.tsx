import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  isSameMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  CalendarCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AgendaDaysToShow,
  AgendaView,
  CalendarDndProvider,
  type CalendarEvent,
  type CalendarView,
  DayView,
  EventGap,
  EventHeight,
  MonthView,
  WeekCellsHeight,
  WeekStartsOn,
  WeekView,
} from "@/components/ui/event-calendar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface EventCalendarProps {
  events?: CalendarEvent[];
  onEventSelect?: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent, daysMoved: number) => void;
  onEventCreate?: (start: Date) => void;
  className?: string;
  initialView?: CalendarView;
}

const noop = () => {};

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const MONTHS = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const dayTitle = (dateStyle: "medium" | "long" | "full", date: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle }).format(date);

const isShortcutOrTyping = (e: KeyboardEvent): boolean =>
  e.metaKey ||
  e.ctrlKey ||
  e.altKey ||
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement ||
  (e.target instanceof HTMLElement &&
    (e.target.isContentEditable ||
      e.target.closest('[role="dialog"], [role="menu"], [role="listbox"]') !== null));

export function EventCalendar({
  events = [],
  onEventSelect = noop,
  onEventUpdate = noop,
  onEventCreate = noop,
  className,
  initialView = "month",
}: EventCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>(initialView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutOrTyping(e)) return;

      switch (e.key.toLowerCase()) {
        case "m":
          setView("month");
          break;
        case "w":
          setView("week");
          break;
        case "d":
          setView("day");
          break;
        case "a":
          setView("agenda");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePrevious = () => {
    if (view === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, -1));
    } else if (view === "agenda") {
      setCurrentDate(addDays(currentDate, -AgendaDaysToShow));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (view === "day") {
      setCurrentDate(addDays(currentDate, 1));
    } else if (view === "agenda") {
      setCurrentDate(addDays(currentDate, AgendaDaysToShow));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const viewTitle = useMemo(() => {
    const range = (start: Date, end: Date) =>
      isSameMonth(start, end) ? MONTH.format(start) : MONTHS.formatRange(start, end);
    if (view === "week") {
      return range(
        startOfWeek(currentDate, { weekStartsOn: WeekStartsOn }),
        endOfWeek(currentDate, { weekStartsOn: WeekStartsOn }),
      );
    }
    if (view === "day") {
      return (
        <>
          <span aria-hidden="true" className="min-[480px]:hidden">
            {dayTitle("medium", currentDate)}
          </span>
          <span aria-hidden="true" className="max-[479px]:hidden min-md:hidden">
            {dayTitle("long", currentDate)}
          </span>
          <span className="max-md:hidden">{dayTitle("full", currentDate)}</span>
        </>
      );
    }
    if (view === "agenda") {
      return range(currentDate, addDays(currentDate, AgendaDaysToShow - 1));
    }
    return MONTH.format(currentDate);
  }, [currentDate, view]);

  return (
    <div
      className="flex flex-col rounded-lg border has-data-[slot=month-view]:flex-1"
      style={
        {
          "--event-gap": `${EventGap}px`,
          "--event-height": `${EventHeight}px`,
          "--week-cells-height": `${WeekCellsHeight}px`,
        } as React.CSSProperties
      }
    >
      <CalendarDndProvider onEventUpdate={onEventUpdate}>
        <div className={cn("flex items-center justify-between p-2 sm:p-4", className)}>
          <div className="flex items-center gap-1 sm:gap-4">
            <Button
              className="max-[479px]:aspect-square max-[479px]:p-0!"
              onClick={handleToday}
              variant="outline"
            >
              <CalendarCheckIcon aria-hidden="true" className="min-[480px]:hidden" size={16} />
              <span className="max-[479px]:sr-only">Today</span>
            </Button>
            <div className="flex items-center sm:gap-2">
              <Button aria-label="Previous" onClick={handlePrevious} size="icon" variant="ghost">
                <ChevronLeftIcon aria-hidden="true" size={16} />
              </Button>
              <Button aria-label="Next" onClick={handleNext} size="icon" variant="ghost">
                <ChevronRightIcon aria-hidden="true" size={16} />
              </Button>
            </div>
            <h2 className="font-serif font-semibold text-sm sm:text-lg md:text-xl">{viewTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5 max-[479px]:h-8" variant="outline">
                  <span>
                    <span aria-hidden="true" className="min-[480px]:hidden">
                      {view.charAt(0).toUpperCase()}
                    </span>
                    <span className="max-[479px]:sr-only">
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </span>
                  </span>
                  <ChevronDownIcon aria-hidden="true" className="-me-1 opacity-60" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                <DropdownMenuItem onClick={() => setView("month")}>
                  Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("week")}>
                  Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("day")}>
                  Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("agenda")}>
                  Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onEventCreate={onEventCreate}
              onEventSelect={onEventSelect}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onEventCreate={onEventCreate}
              onEventSelect={onEventSelect}
            />
          )}
          {view === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onEventCreate={onEventCreate}
              onEventSelect={onEventSelect}
            />
          )}
          {view === "agenda" && (
            <AgendaView currentDate={currentDate} events={events} onEventSelect={onEventSelect} />
          )}
        </div>
      </CalendarDndProvider>
    </div>
  );
}
