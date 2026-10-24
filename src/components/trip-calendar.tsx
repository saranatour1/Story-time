import { Link } from "@tanstack/react-router";
import { addMonths, format, isSameMonth, isToday } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { monthGrid, tripsOn } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Trip = { _id: string; title: string; startsAt?: number; endsAt?: number };

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const FULL_DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

// The experiences on a month calendar, each on every day it covers. Opens on
// this month; trips with no dates are only in the grid.
export const TripCalendar = ({ trips }: { trips: Trip[] }) => {
  const [month, setMonth] = useState(() => new Date());
  const weeks = monthGrid(month);

  return (
    <section aria-label="Calendar" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{MONTH.format(month)}</h2>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            aria-label="Previous month"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Next month"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-sm">
        {weeks[0]?.map((day) => (
          <div
            key={day.getDay()}
            className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {WEEKDAY.format(day)}
          </div>
        ))}
        {weeks.flat().map((day) => (
          <div
            key={day.getTime()}
            className={cn(
              "flex min-h-24 min-w-0 flex-col gap-1 bg-card p-1.5",
              !isSameMonth(day, month) && "bg-muted/40 text-muted-foreground",
            )}
          >
            <time
              dateTime={format(day, "yyyy-MM-dd")}
              aria-label={FULL_DAY.format(day)}
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs",
                isToday(day) && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {day.getDate()}
            </time>
            {tripsOn(day, trips).map((trip) => (
              <Link
                key={trip._id}
                to="/e/$id"
                params={{ id: trip._id }}
                className="truncate rounded bg-amber-200 px-1.5 py-0.5 text-xs text-stone-950 hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-amber-200/90"
              >
                {trip.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};
