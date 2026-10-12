// Who made something: a person, an agent (an AI working for a person, like
// Scribe) or the system. The server stores
// an agent's name and leaves people unmarked; this is where that becomes a kind.
export type ActorView =
  | { kind: "human"; name?: string }
  | { kind: "agent"; name: string; onBehalfOf?: string }
  | { kind: "system" };

// A moment's author: the person, or the agent that added it for them.
export const authorOf = (m: { authorName?: string; authorAgent?: string }): ActorView => {
  return m.authorAgent === undefined
    ? { kind: "human", name: m.authorName }
    : { kind: "agent", name: m.authorAgent, onBehalfOf: m.authorName };
};

// A moment's latest editor, once it has been edited. A person is known by their
// id; their name is optional, so someone who set none is still a person.
export const editorOf = (m: {
  editedAt?: number;
  editedById?: string;
  editedByName?: string;
  editedByAgent?: string;
}): ActorView | undefined => {
  if (m.editedAt === undefined) return undefined;
  if (m.editedByAgent !== undefined) {
    return { kind: "agent", name: m.editedByAgent, onBehalfOf: m.editedByName };
  }
  return m.editedById === undefined ? { kind: "system" } : { kind: "human", name: m.editedByName };
};

// A moment's latest edit, when it is news: an agent's, or a person's who is not
// its author.
export const editNoticeOf = (m: {
  authorId?: string;
  editedAt?: number;
  editedById?: string;
  editedByName?: string;
  editedByAgent?: string;
}): { at: number; by: ActorView } | undefined => {
  const by = editorOf(m);
  if (by === undefined || m.editedAt === undefined) return undefined;
  if (by.kind === "agent") return { at: m.editedAt, by };
  return by.kind === "human" && m.editedById !== m.authorId ? { at: m.editedAt, by } : undefined;
};

// A change in the activity log. `name` is the person's display name, when the
// caller has looked it up.
export const changeActorOf = (c: { actorId?: string; agent?: string }, name?: string): ActorView => {
  if (c.agent !== undefined) return { kind: "agent", name: c.agent, onBehalfOf: name };
  return c.actorId === undefined ? { kind: "system" } : { kind: "human", name };
};

// The words for an actor, for labels and tooltips.
export const describeActor = (actor: ActorView): string => {
  switch (actor.kind) {
    case "human":
      return actor.name ?? "Anonymous";
    case "agent":
      return actor.onBehalfOf ? `${actor.name}, an AI agent working for ${actor.onBehalfOf}` : `${actor.name}, an AI agent`;
    case "system":
      return "The system";
  }
};

// The author as a story's by-line names them: "you" for the signed-in person's
// own moment, the person by name, or the agent that added the moment for them.
// A shared story names no one, so it has no author at all.
export const authorByline = (
  m: { authorId?: string; authorName?: string; authorAgent?: string },
  meId?: string,
): string | undefined => {
  if (m.authorId === undefined) return undefined;
  if (m.authorAgent !== undefined) return describeActor({ kind: "agent", name: m.authorAgent });
  return m.authorId === meId ? "you" : describeActor({ kind: "human", name: m.authorName });
};

export const isAgent = (actor: ActorView): actor is Extract<ActorView, { kind: "agent" }> => actor.kind === "agent";
