/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const invitesModules = import.meta.glob([
  "../components/invites/**/*.ts",
  "../components/invites/**/*.js",
]);
const emailModules = import.meta.glob([
  "../components/email/**/*.ts",
  "../components/email/**/*.js",
]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, guestId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  return { t, owner, guest: as(guestId), guestId, eventId };
}

const tokenOf = (link: string) => link.split("/invite/")[1]!;

describe("invites", () => {
  test("a link works once and grants a viewer session", async () => {
    const { owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.invites.create, {
      eventId,
      role: "viewer",
    });
    const token = tokenOf(link);

    await guest.mutation(api.invites.accept, { token });
    expect((await guest.query(api.events.get, { eventId }))?.role).toBe("viewer");

    await expect(
      guest.mutation(api.invites.accept, { token }),
    ).rejects.toThrow(/INVITE_INVALID/);
  });

  test("dismissed invites are gone", async () => {
    const { owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.invites.create, {
      eventId,
      role: "viewer",
    });
    const [invite] = await owner.query(api.invites.listForEvent, { eventId });
    await owner.mutation(api.invites.dismiss, {
      eventId,
      inviteId: invite!.inviteId,
    });
    expect(await owner.query(api.invites.listForEvent, { eventId })).toEqual([]);
    await expect(
      guest.mutation(api.invites.accept, { token: tokenOf(link) }),
    ).rejects.toThrow(/INVITE_INVALID/);
  });

  test("expired invites can't be used and get purged", async () => {
    const { t, owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.invites.create, {
      eventId,
      role: "viewer",
      ttlDays: 1,
    });
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    await expect(
      guest.mutation(api.invites.accept, { token: tokenOf(link) }),
    ).rejects.toThrow(/INVITE_INVALID/);
    // The attempt above deleted it; the cron finds nothing left.
    expect(await t.mutation(internal.invites.sweepExpired, {})).toBe(0);
  });

  test("an invite never stores the plaintext token", async () => {
    const { t, owner, eventId } = await setup();
    const { link } = await owner.mutation(api.invites.create, {
      eventId,
      role: "viewer",
    });
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(JSON.stringify(rows)).not.toContain(tokenOf(link));
  });

  test("re-inviting a revoked guest restores access", async () => {
    const { owner, guest, eventId } = await setup();
    const first = await owner.mutation(api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.invites.accept, { token: tokenOf(first.link) });
    const [session] = await owner.query(api.sessions.listForEvent, { eventId });
    await owner.mutation(api.sessions.revoke, { sessionId: session!._id });
    expect(await guest.query(api.events.get, { eventId })).toBeNull();

    const second = await owner.mutation(api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.invites.accept, { token: tokenOf(second.link) });
    expect((await guest.query(api.events.get, { eventId }))?.role).toBe("viewer");
  });
});

describe("email outbox", () => {
  test("queues a message and rejects bad recipients", async () => {
    const { t } = await setup();
    const id = await t.mutation(components.email.lib.send, {
      to: "friend@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
    expect(await t.query(components.email.lib.status, { id })).toMatchObject({
      status: "queued",
    });
    await expect(
      t.mutation(components.email.lib.send, {
        to: "not-an-email",
        subject: "Hi",
        html: "<p>Hi</p>",
      }),
    ).rejects.toThrow();
  });
});
