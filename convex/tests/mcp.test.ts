/// <reference types="vite/client" />
import aggregateTest from "@convex-dev/aggregate/test";
import mcpTest from "@convex-dev/mcp/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { AGGREGATES } from "../lib/aggregates";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  process.env.CONVEX_SITE_URL = "https://story.example";
  process.env.APP_URL = "https://app.example";
});

const AMMAN = 3 * 60;
const FLIGHT = Date.UTC(2025, 1, 20, 14, 29);

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
};

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  mcpTest.register(t);
  for (const name of AGGREGATES) aggregateTest.register(t, name);
  const make = () => t.run((ctx) => ctx.db.insert("users", { displayName: "Someone" }));
  const [ownerId, helperId, viewerId, strangerId] = [
    await make(),
    await make(),
    await make(),
    await make(),
  ];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  for (const [userId, role] of [
    [helperId, "contributor"],
    [viewerId, "viewer"],
  ] as const) {
    await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId, grantedBy: ownerId, role }));
  }
  const flight = await owner.mutation(api.api.moments.create, {
    eventId,
    startsAt: FLIGHT,
    tzOffsetMinutes: AMMAN,
    place: "Queen Alia Airport",
    blocks: [{ type: "note", text: `Off we go. ${"x".repeat(400)}` }],
    transport: "plane",
    stops: [{ place: "Istanbul", blocks: [{ type: "note", text: "Layover" }] }],
    labels: ["travel"],
  });

  const keyFor = async (userId: Id<"users">, scopes?: string[]) => {
    const { apiKey } = await as(userId).action(api.api.mcp.createApiKey, { name: "test", scopes });
    return apiKey;
  };
  const rpc = async (key: string | undefined, method: string, params?: unknown) => {
    const res = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        "MCP-Protocol-Version": "2025-06-18",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const call = async (key: string, name: string, args: Record<string, unknown> = {}) => {
    const { status, body } = await rpc(key, "tools/call", { name, arguments: args });
    return { status, result: body?.result as ToolResult | undefined };
  };
  const moment = (id: Id<"moments">) => t.run((ctx) => ctx.db.get("moments", id));

  return { t, eventId, flight, ownerId, helperId, viewerId, strangerId, keyFor, rpc, call, moment };
};

describe("the MCP server", () => {
  test("nobody gets in without a key, and a read-only key sees and calls only the read tools", async () => {
    const { rpc, call, keyFor, ownerId, eventId } = await setup();
    expect((await rpc(undefined, "tools/list")).status).toBe(401);
    expect((await rpc("mcp_sk_made-up", "tools/list")).status).toBe(401);

    const all = await rpc(await keyFor(ownerId), "tools/list");
    expect(all.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "list_experiences",
      "search_moments",
      "get_moment",
      "create_experience",
      "add_moment",
      "update_moment",
      "set_moment_archived",
    ]);
    for (const tool of all.body.result.tools) {
      expect(tool.annotations, tool.name).toBeDefined();
      expect(tool.outputSchema, tool.name).toBeDefined();
    }

    const reader = await keyFor(ownerId, ["moments:read"]);
    const seen = await rpc(reader, "tools/list");
    expect(seen.body.result.tools).toHaveLength(3);
    expect((await call(reader, "add_moment", { experienceId: eventId, note: "x" })).status).toBe(
      403,
    );
  });

  test("an agent finds, reads, adds, changes and archives moments as the person", async () => {
    const { t, call, keyFor, ownerId, eventId, flight, moment } = await setup();
    const key = await keyFor(ownerId);

    const listed = await call(key, "list_experiences");
    expect(listed.result?.structuredContent).toEqual({
      experiences: [
        {
          id: eventId,
          title: "Untitled experience",
          role: "owner",
          moments: 1,
          archived: false,
          url: `https://app.example/e/${eventId}`,
        },
      ],
    });

    const found = await call(key, "search_moments", { experienceId: eventId, query: "ISTANBUL" });
    const hit = (found.result?.structuredContent?.moments as Array<Record<string, unknown>>)[0]!;
    expect(found.result?.structuredContent?.matched).toBe(1);
    expect(hit).toMatchObject({
      id: flight,
      when: "2025-02-20T17:29",
      utcOffsetMinutes: AMMAN,
      place: "Queen Alia Airport",
      stops: [{ place: "Istanbul", notes: ["Layover"] }],
      yours: true,
      canChange: true,
      archived: false,
    });
    expect((hit.notes as string[])[0]).toMatch(/… \(get_moment has the rest\)$/);
    const none = await call(key, "search_moments", { experienceId: eventId, day: "2025-02-21" });
    expect(none.result?.structuredContent).toEqual({ moments: [], matched: 0 });

    const whole = await call(key, "get_moment", { momentId: flight });
    expect((whole.result?.structuredContent?.notes as string[])[0]).toHaveLength(411);

    const added = await call(key, "add_moment", {
      experienceId: eventId,
      note: "Ramen at the station",
      when: "2025-02-22T19:30",
      utcOffsetMinutes: 540,
      place: "Tokyo",
      lat: 35.68,
      lng: 139.76,
      labels: ["food"],
    });
    expect(added.result?.isError).toBeUndefined();
    const ramen = added.result?.structuredContent?.id as Id<"moments">;
    expect((await moment(ramen))?.startsAt).toBe(Date.UTC(2025, 1, 22, 10, 30));
    expect((await moment(ramen))?.authorAgent).toBe("AI agent");
    expect((await moment(ramen))?.geo).toBeDefined();

    const changed = await call(key, "update_moment", {
      momentId: ramen,
      when: "2025-02-23",
      transport: "train",
      addNote: "The broth was perfect",
      addStop: { place: "Ueno" },
    });
    expect(changed.result?.structuredContent).toMatchObject({
      when: "2025-02-23T19:30",
      transport: "train",
      notes: ["Ramen at the station", "The broth was perfect"],
      stops: [{ place: "Ueno", notes: [] }],
    });
    const nothing = await call(key, "update_moment", { momentId: ramen });
    expect(nothing.result?.isError).toBe(true);

    const archived = await call(key, "set_moment_archived", { momentId: ramen, archived: true });
    expect(archived.result?.structuredContent?.archived).toBe(true);
    expect((await moment(ramen))?.archived).toBe(true);
    await call(key, "set_moment_archived", { momentId: ramen, archived: false });
    expect((await moment(ramen))?.archived).toBeUndefined();

    const log = await t.run((ctx) => ctx.db.query("changes").take(100));
    const byAgent = log.filter((c) => c.agent === "AI agent");
    expect(byAgent.length).toBeGreaterThanOrEqual(5);
    expect(byAgent.every((c) => c.actorId === ownerId)).toBe(true);

    const made = await call(key, "create_experience", { title: "Japan in spring" });
    expect(made.result?.structuredContent).toMatchObject({
      title: "Japan in spring",
      role: "owner",
    });
    expect((await call(key, "create_experience", { title: "x" })).result?.isError).toBe(true);
  });

  test("a valid id is no use to someone the experience isn't shared with", async () => {
    const { call, keyFor, strangerId, eventId, flight, moment } = await setup();
    const key = await keyFor(strangerId);
    const before = await moment(flight);

    expect((await call(key, "list_experiences")).result?.structuredContent).toEqual({
      experiences: [],
    });
    const attempts = [
      await call(key, "search_moments", { experienceId: eventId }),
      await call(key, "get_moment", { momentId: flight }),
      await call(key, "add_moment", { experienceId: eventId, note: "Not mine" }),
      await call(key, "update_moment", { momentId: flight, place: "Elsewhere" }),
      await call(key, "set_moment_archived", { momentId: flight, archived: true }),
    ];
    for (const attempt of attempts) {
      expect(attempt.result?.isError).toBe(true);
      expect(attempt.result?.structuredContent).toBeUndefined();
      expect(attempt.result?.content[0]?.text).toMatch(/^No (experience|moment) with that id/);
    }
    expect(await moment(flight)).toEqual(before);
  });

  test("roles hold: a viewer can't add, a helper can't change the owner's moment or see it archived", async () => {
    const { t, call, keyFor, helperId, viewerId, eventId, flight, moment } = await setup();
    const viewer = await keyFor(viewerId);
    const helper = await keyFor(helperId);

    const read = await call(viewer, "get_moment", { momentId: flight });
    expect(read.result?.structuredContent).toMatchObject({ yours: false, canChange: false });
    expect(
      (await call(viewer, "add_moment", { experienceId: eventId, note: "x" })).result,
    ).toMatchObject({ isError: true });

    const meddle = await call(helper, "update_moment", { momentId: flight, place: "Elsewhere" });
    expect(meddle.result?.content[0]?.text).toBe("You can only change moments you added yourself.");
    const own = await call(helper, "add_moment", { experienceId: eventId, note: "Mine" });
    expect(own.result?.structuredContent).toMatchObject({ yours: true, canChange: true });

    await t.run((ctx) => ctx.db.patch("moments", flight, { archived: true }));
    expect((await call(helper, "get_moment", { momentId: flight })).result?.isError).toBe(true);
    const left = await call(helper, "search_moments", { experienceId: eventId });
    expect(left.result?.structuredContent?.matched).toBe(1);
    expect((await moment(flight))?.place).toBeDefined();
  });

  test("a blocked account's key stops working, and an archived experience takes no changes", async () => {
    const { t, call, keyFor, ownerId, eventId, flight } = await setup();
    const key = await keyFor(ownerId);

    await t.run((ctx) => ctx.db.patch("events", eventId, { status: "archived" }));
    expect(
      (await call(key, "add_moment", { experienceId: eventId, note: "x" })).result?.isError,
    ).toBe(true);
    expect((await call(key, "get_moment", { momentId: flight })).result?.isError).toBeUndefined();

    await t.run((ctx) => ctx.db.patch("users", ownerId, { blockedAt: Date.now() }));
    const blocked = await call(key, "list_experiences");
    expect(blocked.result?.content[0]?.text).toBe("This account can't use Story-time right now.");
  });
});
