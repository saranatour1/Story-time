/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const emailModules = import.meta.glob([
  "../components/email/**/*.ts",
  "../components/email/**/*.js",
]);
const invitesModules = import.meta.glob([
  "../components/invites/**/*.ts",
  "../components/invites/**/*.js",
]);

const cf = { CF_ACCOUNT_ID: "acct", CF_EMAIL_TOKEN: "token", EMAIL_FROM: "a@example.com" };

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  t.registerComponent("email", emailSchema, emailModules);
  t.registerComponent("invites", invitesSchema, invitesModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [aId, bId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const a = as(aId);
  const eventId = await a.mutation(api.api.events.createDraft, {});
  return { t, aId, bId, a, b: as(bId), eventId };
};

type Mail = { to?: string; reply_to?: string; subject?: string; html?: string; text?: string };

const enableMail = () => {
  const fetchMock = vi.fn((_input: unknown, init?: { body?: string }) => {
    void _input;
    void init;
    return Promise.resolve(Response.json({ result: {} }));
  });
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  Object.assign(process.env, cf);
  return fetchMock;
};

const disableMail = () => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  for (const key of Object.keys(cf)) delete process.env[key];
  vi.unstubAllGlobals();
  vi.useRealTimers();
};

const mailsOf = (fetchMock: ReturnType<typeof enableMail>): Mail[] => {
  return fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body ?? "{}") as Mail);
};

const tokenIn = (mail: Mail): string => {
  const found = `${mail.text ?? ""}\n${mail.html ?? ""}`.match(/verify-email#([A-Za-z0-9_-]+)/);
  if (found?.[1] === undefined) throw new Error("confirmation link missing");
  return found[1];
};

describe("email confirmation", () => {
  test("a typed address waits, then becomes the one we trust", async () => {
    const { t, a, b } = await setup();
    const waiting = await a.mutation(api.api.users.updateSettings, { email: " Sara@Example.COM " });
    expect(waiting.emailStatus).toBe("waiting");
    const before = await a.query(api.api.users.getCurrentUser, {});
    expect(before?.email).toBeUndefined();
    expect(before).toMatchObject({ pendingEmail: "sara@example.com", emailVerified: false });

    const fetchMock = enableMail();
    try {
      expect((await a.mutation(api.api.users.resendEmailVerification, {})).emailed).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const confirm = mailsOf(fetchMock).find(
        (m) => m.subject === "Confirm your email for Story-time",
      );
      expect(confirm?.to).toBe("sara@example.com");
      const token = tokenIn(confirm ?? {});

      await expect(b.mutation(api.api.users.verifyEmail, { token })).rejects.toThrow(
        /Sign in as the person/,
      );
      await expect(a.mutation(api.api.users.verifyEmail, { token: "not-a-token" })).rejects.toThrow(
        /doesn't work/,
      );

      await a.mutation(api.api.users.verifyEmail, { token });
      const me = await a.query(api.api.users.getCurrentUser, {});
      expect(me).toMatchObject({ email: "sara@example.com", emailVerified: true });
      expect(me?.pendingEmail).toBeUndefined();
      const row = await t.run(async (ctx) => ctx.db.get("users", me!.id));
      expect(row?.emailVerifyKey).toBeUndefined();
      expect(row?.pendingEmail).toBeUndefined();
      await a.mutation(api.api.users.setOnThisDay, { on: true });
      expect((await a.query(api.api.users.getCurrentUser, {}))?.onThisDay).toBe(true);
    } finally {
      disableMail();
    }
  });

  test("an expired link is refused, and a resend is capped", async () => {
    const { t, a, aId } = await setup();
    const fetchMock = enableMail();
    try {
      await a.mutation(api.api.users.updateSettings, { email: "sara@example.com" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const token = tokenIn(mailsOf(fetchMock)[0] ?? {});
      await t.run((ctx) => ctx.db.patch("users", aId, { emailVerifyExpires: Date.now() - 1 }));
      await expect(a.mutation(api.api.users.verifyEmail, { token })).rejects.toThrow(/expired/);

      fetchMock.mockClear();
      for (let i = 0; i < 4; i++) {
        expect((await a.mutation(api.api.users.resendEmailVerification, {})).emailed).toBe(true);
      }
      await expect(a.mutation(api.api.users.resendEmailVerification, {})).rejects.toThrow(
        /RATE_LIMITED/,
      );
    } finally {
      disableMail();
    }
  });

  test("an older unconfirmed address is not trusted, and resend waits when email is off", async () => {
    const { t, a, aId } = await setup();
    await t.run((ctx) => ctx.db.patch("users", aId, { email: "old@example.com" }));
    const me = await a.query(api.api.users.getCurrentUser, {});
    expect(me?.email).toBeUndefined();
    expect(me?.pendingEmail).toBe("old@example.com");
    expect(
      (await a.mutation(api.api.users.updateSettings, { email: "old@example.com" })).emailStatus,
    ).toBe("unchanged");
    expect((await a.mutation(api.api.users.resendEmailVerification, {})).emailed).toBe(false);
    await expect(a.mutation(api.api.users.setOnThisDay, { on: true })).rejects.toThrow(
      /Confirm your email/,
    );
  });
});

describe("reply-to", () => {
  test("share and invite mail use a confirmed address, and omit one that is not", async () => {
    const { t, a, aId, eventId } = await setup();
    await a.mutation(api.api.share.enable, { eventId });
    const fetchMock = enableMail();
    try {
      expect(
        (await a.mutation(api.api.share.emailLink, { eventId, to: "friend@example.com" })).emailed,
      ).toBe(true);
      expect(
        (
          await a.mutation(api.api.invites.create, {
            eventId,
            role: "viewer",
            sendTo: "guest@example.com",
          })
        ).emailed,
      ).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      for (const mail of mailsOf(fetchMock)) expect(mail.reply_to).toBeUndefined();

      await t.run((ctx) =>
        ctx.db.patch("users", aId, { email: "sara@example.com", emailVerified: true }),
      );
      fetchMock.mockClear();
      await a.mutation(api.api.share.emailLink, { eventId, to: "friend2@example.com" });
      await a.mutation(api.api.invites.create, {
        eventId,
        role: "viewer",
        sendTo: "guest2@example.com",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const sent = mailsOf(fetchMock).filter(
        (m) => m.subject?.startsWith("A story to read") || m.subject?.startsWith("You're invited"),
      );
      expect(sent).toHaveLength(2);
      for (const mail of sent) expect(mail.reply_to).toBe("sara@example.com");
    } finally {
      disableMail();
    }
  });
});

describe("on this day", () => {
  test("mails a link and nothing about the memory, once, for a past year", async () => {
    // Set the day before anything runs: convex-test never moves a
    // transaction's clock back behind an earlier commit.
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 12, 15));
    const { t, a, aId, eventId } = await setup();
    await t.run((ctx) =>
      ctx.db.patch("users", aId, {
        email: "sara@example.com",
        emailVerified: true,
        onThisDay: true,
      }),
    );
    await a.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2025, 9, 12, 15),
      place: "SECRET_PLACE",
      blocks: [{ type: "note", text: "SECRET_NOTE_TEXT" }],
    });
    await a.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 9, 12, 15),
      blocks: [{ type: "note", text: "SECRET_TODAY" }],
    });
    const past = await t.run(async (ctx) => {
      const rows = await ctx.db.query("moments").collect();
      const row = rows.find((m) => m.startsAt === Date.UTC(2025, 9, 12, 15));
      if (row === undefined) throw new Error("missing moment");
      await ctx.db.patch("moments", row._id, { monthDay: undefined });
      return row._id;
    });
    await t.finishAllScheduledFunctions(() => undefined);

    const fetchMock = enableMail();
    try {
      vi.setSystemTime(Date.UTC(2026, 9, 12, 15));
      await t.mutation(internal.model.onThisDay.prepare, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => (await ctx.db.get("moments", past))?.monthDay)).toBe(
        "10-12",
      );
      const memory = mailsOf(fetchMock).filter((m) => m.subject === "A memory is waiting");
      expect(memory).toHaveLength(1);
      expect(memory[0]?.to).toBe("sara@example.com");
      expect(memory[0]?.reply_to).toBeUndefined();
      expect(memory[0]?.text).toBe("A memory is waiting.\nhttp://localhost:3000/home");
      const body = JSON.stringify(memory[0]);
      expect(body).not.toContain("SECRET_NOTE_TEXT");
      expect(body).not.toContain("SECRET_PLACE");
      expect(body).not.toContain("SECRET_TODAY");

      fetchMock.mockClear();
      await t.mutation(internal.model.onThisDay.send, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(mailsOf(fetchMock).filter((m) => m.subject === "A memory is waiting")).toHaveLength(0);
    } finally {
      disableMail();
    }
  });

  test("stays quiet without opt-in, a confirmed address, or email configured", async () => {
    const { t, a, aId, eventId } = await setup();
    await a.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2025, 9, 12, 15),
      blocks: [{ type: "note", text: "SECRET_NOTE_TEXT" }],
    });
    await t.finishAllScheduledFunctions(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 12, 15));
    const fetchMock = vi.fn((_input: unknown, init?: { body?: string }) => {
      void _input;
      void init;
      return Promise.resolve(Response.json({ result: {} }));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await t.mutation(internal.model.onThisDay.prepare, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(fetchMock).not.toHaveBeenCalled();

      // eslint-disable-next-line @convex-dev/no-process-env -- test setup
      Object.assign(process.env, cf);
      await t.run((ctx) =>
        ctx.db.patch("users", aId, { email: "sara@example.com", emailVerified: true }),
      );
      await t.mutation(internal.model.onThisDay.prepare, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(mailsOf(fetchMock).filter((m) => m.subject === "A memory is waiting")).toHaveLength(0);

      await t.run((ctx) =>
        ctx.db.patch("users", aId, { onThisDay: true, emailVerified: undefined }),
      );
      await t.mutation(internal.model.onThisDay.send, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(mailsOf(fetchMock).filter((m) => m.subject === "A memory is waiting")).toHaveLength(0);
    } finally {
      disableMail();
    }
  });
});
