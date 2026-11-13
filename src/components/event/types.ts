import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/api";

export type EventView = NonNullable<FunctionReturnType<typeof api.events.get>>;
export type MomentView = FunctionReturnType<typeof api.moments.list>[number];

export type StoryEvent = Pick<
  EventView,
  "_id" | "title" | "description" | "startsAt" | "endsAt" | "status" | "momentCount"
> &
  Partial<Pick<EventView, "role">>;

export type StoryMoment = Pick<
  MomentView,
  | "_id"
  | "startsAt"
  | "tzOffsetMinutes"
  | "place"
  | "geo"
  | "blocks"
  | "transport"
  | "stops"
  | "labels"
> &
  Partial<Pick<MomentView, "authorId" | "authorName" | "authorAgent">>;
