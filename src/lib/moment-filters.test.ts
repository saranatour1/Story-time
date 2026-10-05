import { expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import { matches, noFilters } from "./moment-filters";

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: new Date(2025, 1, 4, 13, 0).getTime(),
  blocks: [],
  ...over,
});

test("search, place, contains, author and date filters", () => {
  const hanover = moment({
    place: "Hanover",
    blocks: [{ type: "note", text: "Coffee by the lake" }],
  });
  const none = moment({ blocks: [{ type: "photo", mediaId: "p" as never }] });

  expect(matches(hanover, noFilters)).toBe(true);
  expect(matches(hanover, { ...noFilters, search: "LAKE" })).toBe(true);
  expect(matches(none, { ...noFilters, search: "lake" })).toBe(false);

  expect(matches(none, { ...noFilters, places: [""] })).toBe(true);
  expect(matches(hanover, { ...noFilters, places: [""] })).toBe(false);

  expect(matches(none, { ...noFilters, contains: ["photo"] })).toBe(true);
  expect(matches(hanover, { ...noFilters, contains: ["photo", "note"] })).toBe(false);

  expect(matches(hanover, { ...noFilters, authors: ["u1"] })).toBe(true);
  expect(matches(hanover, { ...noFilters, authors: ["u2"] })).toBe(false);

  const feb4 = new Date(2025, 1, 4);
  const feb5 = new Date(2025, 1, 5);
  expect(matches(hanover, { ...noFilters, from: feb4 })).toBe(true);
  expect(matches(hanover, { ...noFilters, from: feb5 })).toBe(false);
  expect(matches(hanover, { ...noFilters, from: new Date(2025, 1, 1), to: feb4 })).toBe(true);
});
