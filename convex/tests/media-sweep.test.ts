/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 5, 1, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

let n = 0;
// A row as reserveUpload (reserved) or confirmUpload (ready) leaves it.
const row = (uploaderId: Id<"users">, status: "reserved" | "ready") => ({
  uploaderId,
  r2Key: `test/${n++}`,
  size: 1,
  mime: "image/jpeg",
  keyVersion: 1,
  status,
});

const setup = async () => {
  const t = convexTest(schema, modules);
  const uploaderId = await t.run((ctx) => ctx.db.insert("users", {}));
  const insert = (status: "reserved" | "ready") => t.run((ctx) => ctx.db.insert("media", row(uploaderId, status)));
  const statusOf = (id: Id<"media">) => t.run(async (ctx) => (await ctx.db.get("media", id))?.status);
  return { t, uploaderId, insert, statusOf };
};

describe("sweepReservedUploads", () => {
  test("marks reservations older than an hour deleted; fresh and confirmed uploads stay", async () => {
    const { t, insert, statusOf } = await setup();
    const abandoned = await insert("reserved");
    const confirmed = await insert("ready");
    vi.setSystemTime(T0 + 2 * HOUR - 10 * 60_000);
    const inFlight = await insert("reserved");

    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await t.mutation(internal.model.media.sweepReservedUploads, {})).toBe(1);
    expect(await statusOf(abandoned)).toBe("deleted");
    expect(await statusOf(inFlight)).toBe("reserved");
    expect(await statusOf(confirmed)).toBe("ready");
  });

  test("a backlog bigger than one batch is finished by the scheduled follow-ups", async () => {
    const { t, uploaderId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) await ctx.db.insert("media", row(uploaderId, "reserved"));
    });

    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await t.mutation(internal.model.media.sweepReservedUploads, {})).toBe(100);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const stillReserved = await t.run((ctx) =>
      ctx.db.query("media").withIndex("by_status", (q) => q.eq("status", "reserved")).take(1),
    );
    expect(stillReserved).toEqual([]);
    const swept = await t.run((ctx) =>
      ctx.db.query("media").withIndex("by_status", (q) => q.eq("status", "deleted")).collect(),
    );
    expect(swept).toHaveLength(250);
  });
});
