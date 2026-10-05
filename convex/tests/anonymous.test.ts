/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const args = {
  provider: { name: "anonymous" as const, accountId: "a", profile: {} },
};

afterEach(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  delete process.env.ALLOW_ANONYMOUS_SIGNIN;
});

test("anonymous sign-up is rejected unless the deployment allows it", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(internal.users.createAnonymousUser, args),
  ).rejects.toThrow("Anonymous sign-in is disabled.");

  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ALLOW_ANONYMOUS_SIGNIN = "true";
  await expect(
    t.mutation(internal.users.createAnonymousUser, args),
  ).resolves.toBeTruthy();
});
