/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireEventAccessFor } from "../lib/access";
import { createMoment } from "../model/moments";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

const T0 = Date.UTC(2026, 5, 1, 12);

async function setup() {
  const t = convexTest(schema, modules);
  const make = (displayName?: string) => t.run((ctx) => ctx.db.insert("users", { displayName }));
  const [ownerId, helperId, viewerId, strangerId] = [
    await make("Sara"),
    await make("Noor"),
    await make("Vee"),
    await make("Stranger"),
  ];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, eventId, ownerId, helperId, viewerId, strangerId, owner, helper: as(helperId) };
}

describe("people are people", () => {
  test("a person's moment and edit carry no agent, and the edit names them", async () => {
    const { t, owner, helper, eventId, ownerId } = await setup();
    const momentId = await helper.mutation(api.api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "note", text: "Landed" }],
    });
    let [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.authorName).toBe("Noor");
    expect(m?.authorAgent).toBeUndefined();
    // Never edited, so nothing says who edited it.
    expect(m?.editedAt).toBeUndefined();

    await owner.mutation(api.api.moments.update, { momentId, place: "Lisbon, Alfama" });
    [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.editedById).toBe(ownerId);
    expect(m?.editedByName).toBe("Sara");
    expect(m?.editedByAgent).toBeUndefined();
    expect(m?.editedAt).toBeGreaterThan(0);

    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    const edit = changes.find((c) => c.entity === "moment" && c.action === "update");
    expect(edit?.actorId).toBe(ownerId);
    expect(edit?.agent).toBeUndefined();
  });
});

describe("agents are labelled", () => {
  test("Scribe's edit is the agent's, for no one in particular", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "link", url: "https://example.com/tram" }],
    });
    await t.mutation(internal.model.ai.apply.apply, { momentId, note: "We rode the tram", labels: ["tram"] });

    const [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.editedByAgent).toBe("Scribe");
    expect(m?.editedById).toBeUndefined();
    expect(m?.editedByName).toBeUndefined();
    // The moment is still the person's.
    expect(m?.authorAgent).toBeUndefined();

    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    const edit = changes.find((c) => c.entity === "moment" && c.action === "update");
    expect(edit?.agent).toBe("Scribe");
    expect(edit?.actorId).toBeUndefined();
  });

  test("a moment an agent adds names the agent and the person it acts for", async () => {
    const { t, owner, eventId, ownerId } = await setup();
    const momentId = await t.run(async (ctx) => {
      const access = await requireEventAccessFor(ctx, ownerId, eventId, "contributor");
      return createMoment(ctx, {
        event: access.event,
        userId: ownerId,
        actor: { kind: "agent", name: "Claude", onBehalfOf: ownerId },
        input: { eventId, startsAt: T0, place: "Sintra", blocks: [{ type: "note", text: "Fog on the palace" }] },
      });
    });

    const [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?._id).toBe(momentId);
    expect(m?.authorId).toBe(ownerId);
    expect(m?.authorName).toBe("Sara");
    expect(m?.authorAgent).toBe("Claude");

    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    const made = changes.find((c) => c.entity === "moment" && c.action === "create");
    expect(made?.agent).toBe("Claude");
    expect(made?.actorId).toBe(ownerId);
  });

  test("a shared story says nothing of who or what added or edited", async () => {
    const { t, owner, eventId, ownerId } = await setup();
    await t.run(async (ctx) => {
      const access = await requireEventAccessFor(ctx, ownerId, eventId, "owner");
      const momentId = await createMoment(ctx, {
        event: access.event,
        userId: ownerId,
        actor: { kind: "agent", name: "Claude", onBehalfOf: ownerId },
        input: { eventId, startsAt: T0, place: "Sintra", blocks: [{ type: "note", text: "Fog" }] },
      });
      return momentId;
    });
    const link = await owner.mutation(api.api.share.enable, { eventId });
    const token = link.split("#")[1] ?? "";
    const shared = await t.query(api.api.share.get, { token });
    expect(shared?.moments).toHaveLength(1);
    const keys = Object.keys(shared?.moments[0] ?? {});
    for (const hidden of ["authorId", "authorName", "authorAgent", "editedAt", "editedById", "editedByName", "editedByAgent"]) {
      expect(keys).not.toContain(hidden);
    }
  });
});

describe("access for a given person", () => {
  test("contributors and owners may write, viewers and strangers may not", async () => {
    const { t, eventId, ownerId, helperId, viewerId, strangerId } = await setup();
    const check = (userId: Id<"users">) =>
      t.run((ctx) => requireEventAccessFor(ctx, userId, eventId, "contributor").then((a) => a.role));
    await expect(check(ownerId)).resolves.toBe("owner");
    await expect(check(helperId)).resolves.toBe("contributor");
    await expect(check(viewerId)).rejects.toThrow("Event not found");
    await expect(check(strangerId)).rejects.toThrow("Event not found");
  });
});
