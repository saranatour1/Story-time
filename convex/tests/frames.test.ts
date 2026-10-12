/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { cleanTitle, promptFor, titlesFor } from "../ai/frames";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

describe("titles", () => {
  test("are tidied: no quotes, no trailing stop, one line", () => {
    expect(cleanTitle('  "Pastries   by the river."  ')).toBe("Pastries by the river");
    expect(cleanTitle("Lost in Sintra!")).toBe("Lost in Sintra");
    expect(cleanTitle("   ")).toBeUndefined();
  });

  test("are cut at a word when long", () => {
    const cut = cleanTitle("A very long afternoon wandering the old town with nowhere to be")!;
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith(" ")).toBe(false);
    expect("A very long afternoon wandering the old town with nowhere to be".startsWith(cut)).toBe(true);
  });

  test("only for the pages asked, once each", () => {
    const got = titlesFor(["a", "b"], [
      { id: "a", title: "First" },
      { id: "a", title: "Again" },
      { id: "z", title: "Unasked" },
      { id: "b", title: "  " },
    ]);
    expect(got).toEqual([{ id: "a", title: "First" }]);
  });

  test("the prompt carries each page's places and notes", () => {
    const text = promptFor("Portugal", [{ id: "p1", moments: [{ day: "2026-05-03", place: "Lisbon", note: "Pastéis for breakfast", labels: ["food"] }] }]);
    expect(text).toContain("Portugal");
    expect(text).toContain("Page p1");
    expect(text).toContain("Lisbon");
    expect(text).toContain("Pastéis for breakfast");
  });
});

describe("what the model may see", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const make = () => t.run((ctx) => ctx.db.insert("users", {}));
    const [ownerId, otherId] = [await make(), await make()];
    const owner = t.withIdentity({ subject: ownerId });
    const eventId = await owner.mutation(api.events.createDraft, {});
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 4, 3, 10),
      place: "Lisbon, Portugal",
      blocks: [{ type: "note", text: "First coffee" }],
    });
    return { t, owner, other: t.withIdentity({ subject: otherId }), eventId, momentId };
  }

  test("the owner gets the moments of the frames asked about", async () => {
    const { owner, eventId, momentId } = await setup();
    const got = await owner.query(internal.ai.frames.context, { eventId, frames: [{ id: "f1", momentIds: [momentId] }] });
    expect(got.pages).toHaveLength(1);
    expect(got.pages[0]!.moments[0]).toMatchObject({ place: "Lisbon", note: "First coffee" });
  });

  test("a frame whose moments are gone or elsewhere is left out", async () => {
    const { owner, other, eventId } = await setup();
    // A moment of someone else's experience.
    const theirs = await other.mutation(api.events.createDraft, {});
    const stranger = await other.mutation(api.moments.create, { eventId: theirs, startsAt: Date.UTC(2026, 4, 3, 10), blocks: [{ type: "note", text: "Secret" }] });
    const got = await owner.query(internal.ai.frames.context, { eventId, frames: [{ id: "f1", momentIds: [stranger] }] });
    expect(got.pages).toEqual([]);
  });

  test("someone else can't ask", async () => {
    const { other, eventId, momentId } = await setup();
    await expect(other.query(internal.ai.frames.context, { eventId, frames: [{ id: "f1", momentIds: [momentId] }] })).rejects.toThrow();
  });
});
