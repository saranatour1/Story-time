import { expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { buildStorySteps, clampStep, stepForMoment } from "./story-steps";

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: new Date(2025, 1, 4, 13, 0).getTime(),
  blocks: [],
  stops: [],
  labels: [],
  ...over,
});

const kinds = (title: string, moments: MomentView[]) => buildStorySteps(title, moments).map((s) => s.kind);

test("an empty experience is just a title and an end", () => {
  expect(kinds("Lisbon", [])).toEqual(["title", "end"]);
});

test("single-stop moments without transport become one stop scene each, in time order", () => {
  const later = moment({ _id: "late" as Id<"moments">, startsAt: 20, place: "B" });
  const earlier = moment({ _id: "early" as Id<"moments">, startsAt: 10, place: "A" });
  const steps = buildStorySteps("Trip", [later, earlier]);
  expect(steps.map((s) => s.kind)).toEqual(["title", "stop", "stop", "end"]);
  expect(steps[1]).toMatchObject({ momentId: "early", first: true });
  expect(steps[2]).toMatchObject({ momentId: "late", first: false });
});

test("a travel scene runs before any stop that has a transport", () => {
  const trip = moment({
    place: "Lisbon",
    transport: "plane",
    stops: [
      { place: "Sintra", transport: "train", blocks: [] },
      { place: undefined, blocks: [{ type: "note", text: "lunch" }] },
    ],
  });
  const steps = buildStorySteps("Portugal", [trip]);
  expect(steps.map((s) => s.kind)).toEqual(["title", "travel", "stop", "travel", "stop", "stop", "end"]);
  // The first leg starts from the experience itself.
  expect(steps[1]).toMatchObject({ from: "Portugal", to: "Lisbon", transport: "plane", stopIndex: 0 });
  expect(steps[3]).toMatchObject({ from: "Lisbon", to: "Sintra", transport: "train", stopIndex: 1 });
  // A stop without a place is named by its number.
  expect(steps[5]).toMatchObject({ kind: "stop", stopIndex: 2 });
});

test("the leg before a later moment starts from the previous moment's last place", () => {
  const a = moment({ _id: "a" as Id<"moments">, startsAt: 1, place: "Porto", stops: [{ place: "Gaia", blocks: [] }] });
  const b = moment({ _id: "b" as Id<"moments">, startsAt: 2, place: "Coimbra", transport: "car" });
  const steps = buildStorySteps("Trip", [a, b]);
  expect(steps[3]).toMatchObject({ kind: "travel", from: "Gaia", to: "Coimbra", transport: "car" });
});

test("stop scenes carry the author and labels of their moment", () => {
  const steps = buildStorySteps("Trip", [moment({ authorName: "Sara", labels: ["food"] })]);
  expect(steps[1]).toMatchObject({ kind: "stop", authorName: "Sara", labels: ["food"] });
});

test("clampStep keeps the index inside the story", () => {
  const steps = buildStorySteps("Trip", [moment({})]);
  expect(clampStep(-3, steps)).toBe(0);
  expect(clampStep(99, steps)).toBe(2);
  expect(clampStep(1.7, steps)).toBe(1);
  expect(clampStep(Number.NaN, steps)).toBe(0);
});

test("stepForMoment finds the first scene of a moment", () => {
  const a = moment({ _id: "a" as Id<"moments">, startsAt: 1 });
  const b = moment({ _id: "b" as Id<"moments">, startsAt: 2, transport: "walk" });
  const steps = buildStorySteps("Trip", [a, b]);
  expect(stepForMoment(steps, "b")).toBe(3);
  expect(stepForMoment(steps, "missing")).toBe(0);
});
