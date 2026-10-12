import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/api";

export type EventView = NonNullable<FunctionReturnType<typeof api.events.get>>;
export type MomentView = FunctionReturnType<typeof api.moments.list>[number];

// What a story reads of its experience. A shared story has no role: the people
// watching it have no account here, so nothing shown depends on who they are.
export type StoryEvent = Pick<
  EventView,
  "_id" | "title" | "description" | "startsAt" | "endsAt" | "status" | "momentCount"
> &
  Partial<Pick<EventView, "role">>;

// What a story reads of a moment. A shared story leaves out its author.
export type StoryMoment = Pick<
  MomentView,
  "_id" | "startsAt" | "tzOffsetMinutes" | "place" | "geo" | "blocks" | "transport" | "stops" | "labels"
> &
  Partial<Pick<MomentView, "authorId" | "authorName" | "authorAgent">>;
