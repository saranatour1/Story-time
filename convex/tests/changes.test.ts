/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireEventAccessFor } from "../lib/access";
import { createMoment } from "../model/moments";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const T0 = Date.UTC(2026, 5, 1, 12);

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const make = (displayName: string) => t.run((ctx) => ctx.db.insert("users", { displayName }));
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
    ctx.db.insert("sessions", {
      eventId,
      userId: helperId,
      grantedBy: ownerId,
      role: "contributor",
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return {
    t,
    eventId,
    ownerId,
    owner,
    helper: as(helperId),
    viewer: as(viewerId),
    stranger: as(strangerId),
  };
};

describe("the log names who made each change", () => {
  test("a person's edit shows their name", async () => {
    const { owner, helper, eventId } = await setup();
    const momentId = await helper.mutation(api.api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "note", text: "Landed" }],
    });
    await owner.mutation(api.api.moments.update, { momentId, place: "Lisbon, Alfama" });

    const { page } = await owner.query(api.api.changes.listForEvent, {
      eventId,
      paginationOpts: { numItems: 50, cursor: null },
    });
    // Newest first: Sara's edit, then Noor's moment.
    const moments = page.filter((c) => c.entity === "moment");
    expect(moments).toMatchObject([
      { action: "update", actorName: "Sara" },
      { action: "create", actorName: "Noor" },
    ]);
    expect(moments.every((c) => c.agent === undefined)).toBe(true);
  });

  test("Scribe's edit names the agent and no person", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: T0,
      place: "Lisbon",
      blocks: [{ type: "link", url: "https://example.com/tram" }],
    });
    await t.mutation(internal.model.ai.apply.apply, {
      momentId,
      note: "We rode the tram",
      labels: ["tram"],
    });

    const { page } = await owner.query(api.api.changes.listForEvent, {
      eventId,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const edit = page.find((c) => c.entity === "moment" && c.action === "update");
    expect(edit).toMatchObject({ agent: "Scribe" });
    expect(edit?.actorId).toBeUndefined();
    expect(edit?.actorName).toBeUndefined();
  });

  test("an agent acting for a person names both the agent and the person", async () => {
    const { t, owner, eventId, ownerId } = await setup();
    await t.run(async (ctx) => {
      const access = await requireEventAccessFor(ctx, ownerId, eventId, "contributor");
      return createMoment(ctx, {
        event: access.event,
        userId: ownerId,
        actor: { kind: "agent", name: "Claude", onBehalfOf: ownerId },
        input: {
          eventId,
          startsAt: T0,
          place: "Sintra",
          blocks: [{ type: "note", text: "Fog on the palace" }],
        },
      });
    });

    const { page } = await owner.query(api.api.changes.listForEvent, {
      eventId,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.find((c) => c.entity === "moment")).toMatchObject({
      agent: "Claude",
      actorName: "Sara",
    });
  });
});

describe("only the owner reads the log", () => {
  test("a contributor, a viewer and a stranger are turned away", async () => {
    const { owner, helper, viewer, stranger, eventId } = await setup();
    const read = (who: typeof owner) =>
      who.query(api.api.changes.listForEvent, {
        eventId,
        paginationOpts: { numItems: 5, cursor: null },
      });
    await expect(read(helper)).rejects.toThrow("Event not found");
    await expect(read(viewer)).rejects.toThrow("Event not found");
    await expect(read(stranger)).rejects.toThrow("Event not found");
    await expect(read(owner)).resolves.toMatchObject({ page: expect.any(Array) });
  });
});
