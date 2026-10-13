/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import schema from "../schema";
import { INVITE_EMAILS_PER_DAY, MAX_WAITING_INVITES } from "../lib/limits";

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

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, guestId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  return { t, owner, guest: as(guestId), guestId, eventId };
};

const tokenOf = (link: string) => link.split("/invite#")[1]!;
const firstPage = { numItems: 25, cursor: null };

describe("invites", () => {
  test("an experience holds at most MAX_WAITING_INVITES waiting invites; cancelling one makes room", async () => {
    const { owner, eventId } = await setup();
    for (let i = 0; i < MAX_WAITING_INVITES; i++) {
      await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    }
    await expect(owner.mutation(api.api.invites.create, { eventId, role: "viewer" })).rejects.toThrow(
      /invites waiting to be opened/,
    );

    const waiting = await owner.query(api.api.invites.listForEvent, { eventId });
    expect(waiting).toHaveLength(MAX_WAITING_INVITES);
    await owner.mutation(api.api.invites.dismiss, { eventId, inviteId: waiting[0]!.inviteId });
    await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
  });

  test("a link works for the first person who opens it and grants a viewer session", async () => {
    const { owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.api.invites.create, {
      eventId,
      role: "viewer",
    });
    const token = tokenOf(link);

    await guest.mutation(api.api.invites.accept, { token });
    expect((await guest.query(api.api.events.get, { eventId }))?.role).toBe("viewer");

    await expect(
      guest.mutation(api.api.invites.accept, { token }),
    ).rejects.toThrow(/INVITE_INVALID/);
  });

  test("dismissed invites are gone", async () => {
    const { owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.api.invites.create, {
      eventId,
      role: "viewer",
    });
    const [invite] = await owner.query(api.api.invites.listForEvent, { eventId });
    await owner.mutation(api.api.invites.dismiss, {
      eventId,
      inviteId: invite!.inviteId,
    });
    expect(await owner.query(api.api.invites.listForEvent, { eventId })).toEqual([]);
    await expect(
      guest.mutation(api.api.invites.accept, { token: tokenOf(link) }),
    ).rejects.toThrow(/INVITE_INVALID/);
  });

  test("expired invites can't be used and get purged", async () => {
    const { t, owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.api.invites.create, {
      eventId,
      role: "viewer",
      ttlDays: 1,
    });
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    await expect(
      guest.mutation(api.api.invites.accept, { token: tokenOf(link) }),
    ).rejects.toThrow(/INVITE_INVALID/);
    // Its purge timer removed it; the cron finds nothing left.
    expect(await t.mutation(internal.model.invites.sweepExpired, {})).toBe(0);
  });

  test("an invite never stores the plaintext token", async () => {
    const { t, owner, eventId } = await setup();
    const { link } = await owner.mutation(api.api.invites.create, {
      eventId,
      role: "viewer",
    });
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(JSON.stringify(rows)).not.toContain(tokenOf(link));
  });

  test("re-inviting a revoked guest restores access", async () => {
    const { owner, guest, eventId } = await setup();
    const first = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(first.link) });
    const [session] = (
      await owner.query(api.api.sessions.listForEvent, { eventId, paginationOpts: firstPage })
    ).page;
    await owner.mutation(api.api.sessions.revoke, { sessionId: session!._id });
    expect(await guest.query(api.api.events.get, { eventId })).toBeNull();

    const second = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(second.link) });
    expect((await guest.query(api.api.events.get, { eventId }))?.role).toBe("viewer");
  });

  test("a link opened before access was revoked can't restore it", async () => {
    const { owner, guest, eventId } = await setup();
    const first = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(first.link) });
    // A second link in the group chat: the guest opens it while still a viewer.
    const { link } = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(link) });
    vi.advanceTimersByTime(1000);
    const [session] = (
      await owner.query(api.api.sessions.listForEvent, { eventId, paginationOpts: firstPage })
    ).page;
    await owner.mutation(api.api.sessions.revoke, { sessionId: session!._id });

    await expect(guest.mutation(api.api.invites.accept, { token: tokenOf(link) })).rejects.toThrow(
      /expired or was already used/,
    );
    expect(await guest.query(api.api.events.get, { eventId })).toBeNull();
  });

  test("the owner, or a guest with as much access, doesn't use a link up", async () => {
    const { owner, guest, eventId } = await setup();
    const contributor = await owner.mutation(api.api.invites.create, {
      eventId,
      role: "contributor",
    });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(contributor.link) });

    const { link } = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await owner.mutation(api.api.invites.accept, { token: tokenOf(link) });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(link) });

    // No downgrade, and the viewer link is still pending.
    expect((await guest.query(api.api.events.get, { eventId }))?.role).toBe("contributor");
    expect(await owner.query(api.api.invites.listForEvent, { eventId })).toHaveLength(1);
  });

  test("invite emails are validated, only sent when configured, and capped daily", async () => {
    const { t, owner, eventId } = await setup();
    const send = (sendTo: string) =>
      owner.mutation(api.api.invites.create, { eventId, role: "viewer", sendTo });
    await expect(send("not-an-email")).rejects.toThrow(/Enter a valid email/);
    expect((await send("friend@example.com")).emailed).toBe(false);

    const cf = { CF_ACCOUNT_ID: "acct", CF_EMAIL_TOKEN: "token", EMAIL_FROM: "a@example.com" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: {} })));
    // eslint-disable-next-line @convex-dev/no-process-env -- test setup
    Object.assign(process.env, cf);
    try {
      for (let i = 0; i < INVITE_EMAILS_PER_DAY; i++) {
        expect((await send(`friend${i}@example.com`)).emailed).toBe(true);
      }
      await expect(send("one-more@example.com")).rejects.toThrow(/RATE_LIMITED/);
      // A link without an email is still fine.
      await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });

      // A day later there's room again, and the old rows are cleared.
      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);
      expect((await send("tomorrow@example.com")).emailed).toBe(true);
      const rows = await t.run((ctx) => ctx.db.query("inviteEmails").collect());
      expect(rows).toHaveLength(1);
    } finally {
      // eslint-disable-next-line @convex-dev/no-process-env -- test setup
      for (const key of Object.keys(cf)) delete process.env[key];
      vi.unstubAllGlobals();
    }
  });

  test("archived experiences take no new people, and the link stays usable after", async () => {
    const { owner, guest, eventId } = await setup();
    const { link } = await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(guest.mutation(api.api.invites.accept, { token: tokenOf(link) })).rejects.toThrow(/ARCHIVED/);

    await owner.mutation(api.api.events.update, { eventId, status: "active" });
    await guest.mutation(api.api.invites.accept, { token: tokenOf(link) });
    expect((await guest.query(api.api.events.get, { eventId }))?.role).toBe("viewer");
  });

  test("archived experiences can't create new invites", async () => {
    const { owner, eventId } = await setup();
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(
      owner.mutation(api.api.invites.create, { eventId, role: "viewer" }),
    ).rejects.toThrow(/ARCHIVED/);
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
