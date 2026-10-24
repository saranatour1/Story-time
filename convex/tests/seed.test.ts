/// <reference types="vite/client" />
/* eslint-disable @convex-dev/no-process-env -- this test switches the deployment variables seed:japan checks */
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  process.env.CONVEX_DEPLOYMENT = "dev:test";
  delete process.env.CONVEX_SITE_URL;
  delete process.env.CONVEX_CLOUD_URL;
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("the Japan trip seeds a whole experience, and its journal follows", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const eventId = await t.mutation(internal.model.seed.japan, { userId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const me = t.withIdentity({ subject: userId });
  const event = await me.query(api.api.events.get, { eventId });
  expect(event).toMatchObject({
    title: "Spring in Japan",
    role: "owner",
    status: "active",
    momentCount: 12,
    description: expect.stringContaining("Tokyo"),
  });
  const moments = await me.query(api.api.moments.list, { eventId });
  expect(moments.map((m) => m.place)).toContain("Fushimi Inari Taisha, Kyoto");
  expect(moments.every((m) => m.tzOffsetMinutes === 540 && m.geo !== undefined)).toBe(true);
  // A cover and a page for every moment, cut without anyone opening the book.
  const book = await me.query(api.api.journal.outline, { eventId });
  expect(book.pages).toHaveLength(13);
});

test("seed:japan requires a dev deployment and the account you name", async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const older = await t.run((ctx) => ctx.db.insert("users", {}));
  const newer = await t.run((ctx) => ctx.db.insert("users", {}));
  const saved = process.env.CONVEX_DEPLOYMENT;
  process.env.CONVEX_DEPLOYMENT = "prod:strong-stoat-772";
  await expect(t.mutation(internal.model.seed.japan, { userId: older })).rejects.toThrow(
    /dev deployment/,
  );
  delete process.env.CONVEX_DEPLOYMENT;
  await expect(t.mutation(internal.model.seed.japan, { userId: older })).rejects.toThrow(
    /dev deployment/,
  );
  process.env.CONVEX_DEPLOYMENT = "dev:test";
  process.env.CONVEX_SITE_URL = "https://strong-stoat-772.convex.site";
  await expect(t.mutation(internal.model.seed.japan, { userId: older })).rejects.toThrow(
    /production/,
  );
  delete process.env.CONVEX_SITE_URL;
  const gone = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {});
    await ctx.db.delete("users", id);
    return id;
  });
  await expect(t.mutation(internal.model.seed.japan, { userId: gone })).rejects.toThrow(
    /does not exist/,
  );
  const eventId = await t.mutation(internal.model.seed.japan, { userId: older });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const ownerId = await t.run(async (ctx) => (await ctx.db.get("events", eventId))?.ownerId);
  expect(ownerId).toBe(older);
  expect(ownerId).not.toBe(newer);
  process.env.CONVEX_DEPLOYMENT = saved;
});
