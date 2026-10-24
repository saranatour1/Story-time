import { describe, expect, test } from "vite-plus/test";
import { monthGrid, tripsOn } from "./calendar";

const day = (month: number, date: number) => new Date(2026, month - 1, date);

describe("monthGrid", () => {
  test("whole weeks, Monday first, padded from the months either side", () => {
    const weeks = monthGrid(day(10, 15));
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]).toEqual(day(9, 28));
    expect(weeks.at(-1)?.at(-1)).toEqual(day(11, 1));
  });
});

describe("tripsOn", () => {
  type Trip = { title: string; startsAt?: number; endsAt?: number };
  const porto: Trip = {
    title: "Porto",
    startsAt: day(10, 30).getTime(),
    endsAt: day(11, 2).getTime(),
  };
  const lunch: Trip = { title: "Lunch", startsAt: day(10, 12).setHours(13) };
  const trips: Trip[] = [porto, lunch, { title: "Someday" }];

  test("a trip is on every day from its start to its end, across months", () => {
    expect(tripsOn(day(10, 29), trips)).toEqual([]);
    expect(tripsOn(day(10, 31), trips)).toEqual([porto]);
    expect(tripsOn(day(11, 2), trips)).toEqual([porto]);
    expect(tripsOn(day(11, 3), trips)).toEqual([]);
  });

  test("a trip with one date is on that day only; one with none is on no day", () => {
    expect(tripsOn(day(10, 12), trips)).toEqual([lunch]);
    expect(tripsOn(day(10, 13), trips)).toEqual([]);
  });
});
