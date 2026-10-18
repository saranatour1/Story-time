import { expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { matchesSearch } from "./moment-filters";

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: new Date(2025, 1, 4, 13, 0).getTime(),
  blocks: [],
  stops: [],
  labels: [],
  people: [],
  ...over,
});

test("search finds places, words, links, labels and people, whatever the case", () => {
  const hanover = moment({
    place: "Hanover",
    authorName: "Sara",
    labels: ["food"],
    blocks: [
      { type: "note", text: "Coffee by the lake" },
      { type: "link", url: "https://x.test/menu", title: "The menu" },
    ],
    stops: [{ place: "Sintra", blocks: [] }],
  });
  const photoOnly = moment({ blocks: [{ type: "photo", mediaId: "p" as Id<"media"> }] });

  expect(matchesSearch(hanover, "")).toBe(true);
  expect(matchesSearch(hanover, "  ")).toBe(true);
  for (const q of ["LAKE", "hanover", "sintra", "menu", "food", "sara"])
    expect(matchesSearch(hanover, q)).toBe(true);
  expect(matchesSearch(hanover, "porto")).toBe(false);
  expect(matchesSearch(photoOnly, "lake")).toBe(false);
});

test("an agent's name is searchable", () => {
  expect(matchesSearch(moment({ authorAgent: "Claude Desktop" }), "claude")).toBe(true);
  expect(matchesSearch(moment({}), "claude")).toBe(false);
});
