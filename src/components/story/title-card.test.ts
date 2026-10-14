import { expect, test } from "vitest";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import type { Id } from "../../../convex/_generated/dataModel";
import { dateRange } from "./title-card";

const trip = (over: Partial<StoryEvent>): StoryEvent => ({
  _id: "e1" as Id<"events">,
  title: "Japan",
  description: undefined,
  startsAt: undefined,
  endsAt: undefined,
  status: "active",
  momentCount: 0,
  ...over,
});

const moment = (over: Partial<StoryMoment>): StoryMoment => ({
  _id: "m" as Id<"moments">,
  startsAt: 0,
  blocks: [],
  stops: [],
  labels: [],
  ...over,
});

test("the owner's dates read as they are, and a single day reads once", () => {
  expect(
    dateRange(
      trip({ startsAt: new Date(2025, 10, 9).getTime(), endsAt: new Date(2025, 10, 12).getTime() }),
      [],
    ),
  ).toBe("Nov 9, 2025 – Nov 12, 2025");
  expect(dateRange(trip({ startsAt: new Date(2025, 10, 9).getTime() }), [])).toBe("Nov 9, 2025");
});

test("the span of the moments reads each end on the day it happened there", () => {
  // 22:15 UTC on the 8th is the 9th in Japan; 03:00 UTC on the 12th is the 12th in Japan too.
  const moments = [
    moment({ startsAt: Date.UTC(2025, 10, 8, 22, 15), tzOffsetMinutes: 540 }),
    moment({ startsAt: Date.UTC(2025, 10, 12, 3, 0), tzOffsetMinutes: 540 }),
  ];
  expect(dateRange(trip({}), moments)).toBe("Nov 9, 2025 – Nov 12, 2025");
});

test("nothing to say, nothing shown", () => {
  expect(dateRange(trip({}), [])).toBeNull();
});
