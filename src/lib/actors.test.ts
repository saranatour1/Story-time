import { describe, expect, test } from "vite-plus/test";
import {
  authorByline,
  authorOf,
  changeActorOf,
  describeActor,
  editNoticeOf,
  editorOf,
} from "./actors";

describe("authorOf", () => {
  test("a person, with or without a name", () => {
    expect(authorOf({ authorName: "Sara" })).toEqual({ kind: "human", name: "Sara" });
    expect(authorOf({})).toEqual({ kind: "human", name: undefined });
  });

  test("an agent that added it for a person keeps both names", () => {
    expect(authorOf({ authorName: "Sara", authorAgent: "Claude" })).toEqual({
      kind: "agent",
      name: "Claude",
      onBehalfOf: "Sara",
    });
  });
});

describe("editorOf", () => {
  test("nothing until the moment is edited", () => {
    expect(editorOf({})).toBeUndefined();
  });

  test("a person, an agent, or the system", () => {
    expect(editorOf({ editedAt: 1, editedById: "u2", editedByName: "Noor" })).toEqual({
      kind: "human",
      name: "Noor",
    });
    expect(editorOf({ editedAt: 1, editedByAgent: "Scribe" })).toEqual({
      kind: "agent",
      name: "Scribe",
      onBehalfOf: undefined,
    });
    expect(editorOf({ editedAt: 1 })).toEqual({ kind: "system" });
  });

  test("a person with no display name is still a person, not the system", () => {
    expect(editorOf({ editedAt: 1, editedById: "u2" })).toEqual({ kind: "human", name: undefined });
  });
});

describe("editNoticeOf", () => {
  test("nothing for a moment that was never edited", () => {
    expect(editNoticeOf({ authorId: "u1" })).toBeUndefined();
  });

  test("an agent's edit is news, even on the author's own moment", () => {
    expect(editNoticeOf({ authorId: "u1", editedAt: 5, editedByAgent: "Scribe" })).toEqual({
      at: 5,
      by: { kind: "agent", name: "Scribe", onBehalfOf: undefined },
    });
  });

  test("another person's edit is news; the author's own edit is not", () => {
    expect(
      editNoticeOf({ authorId: "u1", editedAt: 5, editedById: "u2", editedByName: "Noor" }),
    ).toEqual({
      at: 5,
      by: { kind: "human", name: "Noor" },
    });
    expect(
      editNoticeOf({ authorId: "u1", editedAt: 5, editedById: "u1", editedByName: "Sara" }),
    ).toBeUndefined();
  });

  test("a different person with the author's exact name is still a different person", () => {
    expect(
      editNoticeOf({ authorId: "u1", editedAt: 5, editedById: "u2", editedByName: "Sara" }),
    ).toEqual({
      at: 5,
      by: { kind: "human", name: "Sara" },
    });
  });

  test("someone with no display name who isn't the author is named as anonymous, not hidden", () => {
    expect(editNoticeOf({ authorId: "u1", editedAt: 5, editedById: "u2" })).toEqual({
      at: 5,
      by: { kind: "human", name: undefined },
    });
  });
});

describe("changeActorOf", () => {
  test("an agent beats the person it acts for; no actor at all is the system", () => {
    expect(changeActorOf({ actorId: "u1", agent: "Claude" }, "Sara")).toEqual({
      kind: "agent",
      name: "Claude",
      onBehalfOf: "Sara",
    });
    expect(changeActorOf({ actorId: "u1" }, "Sara")).toEqual({ kind: "human", name: "Sara" });
    expect(changeActorOf({})).toEqual({ kind: "system" });
  });
});

describe("authorByline", () => {
  test("nothing in a shared story, which names no one", () => {
    expect(authorByline({})).toBeUndefined();
  });

  test("a person by name, or 'you' for the signed-in person's own moment", () => {
    expect(authorByline({ authorId: "u1", authorName: "Sara" }, "u1")).toBe("you");
    expect(authorByline({ authorId: "u1", authorName: "Sara" }, "u2")).toBe("Sara");
    expect(authorByline({ authorId: "u1", authorName: "Sara" })).toBe("Sara");
    expect(authorByline({ authorId: "u1" })).toBe("Anonymous");
  });

  test("an agent that added a moment for its author is named as the agent", () => {
    expect(authorByline({ authorId: "u1", authorName: "Sara", authorAgent: "Claude" }, "u1")).toBe(
      "Claude, an AI agent",
    );
  });
});

describe("describeActor", () => {
  test("says plainly who it was", () => {
    expect(describeActor({ kind: "human", name: "Sara" })).toBe("Sara");
    expect(describeActor({ kind: "human" })).toBe("Anonymous");
    expect(describeActor({ kind: "agent", name: "Scribe" })).toBe("Scribe, an AI agent");
    expect(describeActor({ kind: "agent", name: "Claude", onBehalfOf: "Sara" })).toBe(
      "Claude, an AI agent working for Sara",
    );
    expect(describeActor({ kind: "system" })).toBe("The system");
  });
});
