export type ActorView =
  | { kind: "human"; name?: string }
  | { kind: "agent"; name: string; onBehalfOf?: string }
  | { kind: "system" };

export const authorOf = (m: { authorName?: string; authorAgent?: string }): ActorView => {
  return m.authorAgent === undefined
    ? { kind: "human", name: m.authorName }
    : { kind: "agent", name: m.authorAgent, onBehalfOf: m.authorName };
};

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

export const changeActorOf = (
  c: { actorId?: string; agent?: string },
  name?: string,
): ActorView => {
  if (c.agent !== undefined) return { kind: "agent", name: c.agent, onBehalfOf: name };
  return c.actorId === undefined ? { kind: "system" } : { kind: "human", name };
};

export const describeActor = (actor: ActorView): string => {
  switch (actor.kind) {
    case "human":
      return actor.name ?? "Anonymous";
    case "agent":
      return actor.onBehalfOf
        ? `${actor.name}, an AI agent working for ${actor.onBehalfOf}`
        : `${actor.name}, an AI agent`;
    case "system":
      return "The system";
  }
};

export const authorByline = (
  m: { authorId?: string; authorName?: string; authorAgent?: string },
  meId?: string,
): string | undefined => {
  if (m.authorId === undefined) return undefined;
  if (m.authorAgent !== undefined) return describeActor({ kind: "agent", name: m.authorAgent });
  return m.authorId === meId ? "you" : describeActor({ kind: "human", name: m.authorName });
};

export const isAgent = (actor: ActorView): actor is Extract<ActorView, { kind: "agent" }> =>
  actor.kind === "agent";
