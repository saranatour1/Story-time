import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { vLastEdit } from "../schema";

// Who is acting: a person, an agent working for a person (the AI that drafts
// notes) or the system itself. What an agent
// writes carries its name, so people can tell it from their own edits.
export type Actor =
  | { kind: "human"; userId: Id<"users"> }
  | { kind: "agent"; name: string; onBehalfOf?: Id<"users"> }
  | { kind: "system" };

// How the change log names an actor. A person leaves only their id, as it
// always has; an agent also leaves its name; the system leaves neither.
export const changeFields = (actor: Actor): { actorId?: Id<"users">; agent?: string } => {
  switch (actor.kind) {
    case "human":
      return { actorId: actor.userId };
    case "agent":
      return { actorId: actor.onBehalfOf, agent: actor.name };
    case "system":
      return {};
  }
};

// What a moment remembers of its latest edit.
export const lastEditOf = (actor: Actor, at: number): Infer<typeof vLastEdit> => {
  switch (actor.kind) {
    case "human":
      return { at, userId: actor.userId };
    case "agent":
      return { at, userId: actor.onBehalfOf, agent: actor.name };
    case "system":
      return { at };
  }
};

// An agent's label is shown to people, so keep it short and plain.
export const agentLabel = (name: string): string => {
  return name.replace(/\s+/g, " ").trim().slice(0, 40);
};
