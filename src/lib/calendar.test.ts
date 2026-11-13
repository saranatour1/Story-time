import { describe, expect, test } from "vite-plus/test";
import { dayGrabbed, weekBars } from "./calendar";

const day = (date: number) => new Date(2026, 10, date);
// Monday 9 to Sunday 15 November 2026.
const week = [9, 10, 11, 12, 13, 14, 15].map(day);
const trip = (title: string, from: number, to = from) => ({
  title,
  start: day(from),
  end: day(to),
});
const bars = (trips: ReturnType<typeof trip>[]) =>
  weekBars(week, trips).map(({ event, ...bar }) => ({ title: event.title, ...bar }));

describe("weekBars", () => {
  test("one bar for the days a trip has in the week, cut where it carries on", () => {
    expect(bars([trip("Amman", 8, 10)])).toEqual([
      { title: "Amman", col: 0, span: 2, lane: 0, starts: false, ends: true },
    ]);
    expect(bars([trip("Vietnam", 14, 20)])).toEqual([
      { title: "Vietnam", col: 5, span: 2, lane: 0, starts: true, ends: false },
    ]);
    expect(bars([trip("Before", 1, 8), trip("After", 16, 18)])).toEqual([]);
  });

  test("a trip that ends after noon still ends on that day", () => {
    const lunch = { title: "Lunch", start: day(12), end: new Date(2026, 10, 12, 13) };
    expect(bars([lunch])).toEqual([
      { title: "Lunch", col: 3, span: 1, lane: 0, starts: true, ends: true },
    ]);
  });

  test("trips that overlap get their own lane; the rest share the top one", () => {
    const trips = [trip("Later", 14), trip("Second", 11, 13), trip("First", 9, 12)];
    expect(bars(trips).map(({ title, lane }) => [title, lane])).toEqual([
      ["First", 0],
      ["Second", 1],
      ["Later", 0],
    ]);
  });
});

describe("dayGrabbed", () => {
  // A three-day bar starting at x=100 and 90 wide: 30 to a day.
  test("the day under the pointer, counted from the bar's first", () => {
    expect(dayGrabbed(100, 100, 90, 3)).toBe(0);
    expect(dayGrabbed(131, 100, 90, 3)).toBe(1);
    expect(dayGrabbed(189, 100, 90, 3)).toBe(2);
  });

  test("a press on the very edge, or on a bar with no width, stays on the bar", () => {
    expect(dayGrabbed(99, 100, 90, 3)).toBe(0);
    expect(dayGrabbed(190, 100, 90, 3)).toBe(2);
    expect(dayGrabbed(120, 100, 0, 3)).toBe(0);
  });
});
