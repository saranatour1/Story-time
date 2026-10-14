/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> = {
  lib: {
    consume: FunctionReference<
      "mutation",
      "internal",
      { token: string },
      null | {
        eventId: string;
        invitedBy: string;
        role: "viewer" | "contributor";
      },
      Name
    >;
    create: FunctionReference<
      "mutation",
      "internal",
      {
        eventId: string;
        invitedBy: string;
        role: "viewer" | "contributor";
        ttlMs: number;
      },
      { expiresAt: number; inviteId: string; token: string },
      Name
    >;
    dismiss: FunctionReference<
      "mutation",
      "internal",
      { eventId: string; inviteId: string },
      boolean,
      Name
    >;
    listForEvent: FunctionReference<
      "query",
      "internal",
      { eventId: string },
      Array<{
        expiresAt: number;
        inviteId: string;
        role: "viewer" | "contributor";
      }>,
      Name
    >;
    lookup: FunctionReference<
      "query",
      "internal",
      { token: string },
      null | {
        createdAt: number;
        eventId: string;
        expiresAt: number;
        invitedBy: string;
        role: "viewer" | "contributor";
      },
      Name
    >;
    removeForEvent: FunctionReference<"mutation", "internal", { eventId: string }, number, Name>;
    sweep: FunctionReference<"mutation", "internal", { limit: number }, number, Name>;
  };
};
