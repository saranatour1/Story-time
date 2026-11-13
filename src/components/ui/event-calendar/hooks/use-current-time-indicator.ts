import { endOfWeek, isSameDay, isWithinInterval, startOfWeek } from "date-fns";
import { useEffect, useState } from "react";

import { EndHour, StartHour, WeekStartsOn } from "@/components/ui/event-calendar/constants";

export function useCurrentTimeIndicator(currentDate: Date, view: "day" | "week") {
  const [currentTimePosition, setCurrentTimePosition] = useState<number>(0);
  const [currentTimeVisible, setCurrentTimeVisible] = useState<boolean>(false);

  useEffect(() => {
    const calculateTimePosition = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const totalMinutes = (hours - StartHour) * 60 + minutes;
      const dayStartMinutes = 0;
      const dayEndMinutes = (EndHour - StartHour) * 60;

      const position = ((totalMinutes - dayStartMinutes) / (dayEndMinutes - dayStartMinutes)) * 100;

      let isCurrentTimeVisible = false;

      if (view === "day") {
        isCurrentTimeVisible = isSameDay(now, currentDate);
      } else if (view === "week") {
        const startOfWeekDate = startOfWeek(currentDate, { weekStartsOn: WeekStartsOn });
        const endOfWeekDate = endOfWeek(currentDate, { weekStartsOn: WeekStartsOn });
        isCurrentTimeVisible = isWithinInterval(now, {
          end: endOfWeekDate,
          start: startOfWeekDate,
        });
      }

      setCurrentTimePosition(position);
      setCurrentTimeVisible(isCurrentTimeVisible);
    };

    calculateTimePosition();

    const interval = setInterval(calculateTimePosition, 60000);

    return () => clearInterval(interval);
  }, [currentDate, view]);

  return { currentTimePosition, currentTimeVisible };
}
