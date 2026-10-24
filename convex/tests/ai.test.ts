/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { titleFromHtml } from "../model/ai/unfurl";
import { limitWrites, takeAi } from "../lib/rateLimit";
import { AI_PER_DAY } from "../lib/limits";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
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
  return { t, eventId, ownerId, owner, helper: as(helperId), viewer: as(viewerId) };
};

describe("AI: ten uses a day per person, across every feature", () => {
  test("ten, then a refusal until midnight UTC; someone else's are their own", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 13, 9, 0));
    try {
      const t = convexTest(schema, modules);
      rateLimiterTest.register(t);
      const take = (key: string) => t.run((ctx) => takeAi(ctx, key));
      for (let i = 0; i < AI_PER_DAY; i++) expect(await take("sara")).toBe(true);
      expect(await take("sara")).toBe(false);
      expect(await take("sam")).toBe(true);
      // Still the same day at 23:59 UTC; the next day starts fresh.
      vi.setSystemTime(Date.UTC(2026, 9, 13, 23, 59));
      expect(await take("sara")).toBe(false);
      vi.setSystemTime(Date.UTC(2026, 9, 14, 0, 1));
      expect(await take("sara")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("Settings shows what's left today, storage and experiences", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 13, 9, 0));
    try {
      const { t, ownerId, owner } = await setup();
      for (let i = 0; i < 3; i++) await t.run((ctx) => takeAi(ctx, ownerId));
      const usage = await owner.query(api.api.users.usage, {});
      expect(usage?.ai).toEqual({
        left: AI_PER_DAY - 3,
        limit: AI_PER_DAY,
        resetsAt: Date.UTC(2026, 9, 14),
      });
      expect(usage?.experiences.used).toBe(1);
      expect(usage?.storage.used).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a client changing things in a loop is stopped", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 300; i++) await limitWrites(ctx, "sara");
      await expect(limitWrites(ctx, "sara")).rejects.toThrow("a lot of changes");
    });
  });
});

describe("unfurl: page titles", () => {
  test("reads the title, decodes basic entities, and drops empty ones", () => {
    expect(
      titleFromHtml("<html><head><title>  Ponte &amp; Co &#8211;\n2026 </title></head></html>"),
    ).toBe("Ponte & Co – 2026");
    expect(titleFromHtml("<title>&lt;b&gt;bold&lt;/b&gt;</title>")).toBe("<b>bold</b>");
    expect(titleFromHtml("<title>   </title>")).toBeUndefined();
    expect(titleFromHtml("no title here")).toBeUndefined();
  });
});
