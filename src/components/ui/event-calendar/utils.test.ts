import { describe, expect, test } from "vite-plus/test";
import { WeekCellsHeight } from "./constants";
import type { CalendarEvent } from "./types";
import { agendaEventsOn, positionTimedEvents } from "./utils";

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute);
const event = (id: string, start: Date, end: Date): CalendarEvent => ({ id, title: id, start, end });

describe("positionTimedEvents", () => {
  test("an event sits at its hours; one that overlaps it moves to the next column", () => {
    const placed = positionTimedEvents(at(13), [
      event("late", at(13, 15), at(13, 16)),
      event("second", at(13, 9, 30), at(13, 10, 30)),
      event("first", at(13, 9), at(13, 11)),
    ]);
    expect(placed.map((p) => [p.event.id, p.left, p.width, p.zIndex])).toEqual([
      ["first", 0, 1, 10],
      ["second", 0.1, 0.9, 11],
      ["late", 0, 1, 10],
    ]);
    expect(placed[0]).toMatchObject({ top: 9 * WeekCellsHeight, height: 2 * WeekCellsHeight });
    expect(placed[1]).toMatchObject({ top: 9.5 * WeekCellsHeight, height: WeekCellsHeight });
  });

  test("an event that began the day before starts at midnight", () => {
    const [overnight] = positionTimedEvents(at(13), [event("overnight", at(12, 22), at(13, 2))]);
    expect(overnight).toMatchObject({ top: 0, height: 2 * WeekCellsHeight });
  });
});

describe("agendaEventsOn", () => {
  const trip = event("trip", at(12), at(15));

  test("an event is listed on the day it starts, not on the days after", () => {
    expect(agendaEventsOn([trip], at(12, 14), false)).toEqual([trip]);
    expect(agendaEventsOn([trip], at(13, 14), false)).toEqual([]);
    expect(agendaEventsOn([trip], at(15, 14), false)).toEqual([]);
  });

  test("on the first day shown, an event already under way is listed too", () => {
    expect(agendaEventsOn([trip], at(13, 14), true)).toEqual([trip]);
    expect(agendaEventsOn([trip], at(15, 14), true)).toEqual([trip]);
    expect(agendaEventsOn([trip], at(16, 14), true)).toEqual([]);
  });
});
