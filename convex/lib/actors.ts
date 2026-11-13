import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { vLastEdit } from "../schema";

export type Actor =
  | { kind: "human"; userId: Id<"users"> }
  | { kind: "agent"; name: string; onBehalfOf?: Id<"users"> }
  | { kind: "system" };

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

export const agentLabel = (name: string): string => {
  return name.replace(/\s+/g, " ").trim().slice(0, 40);
};
