/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as changes from "../changes.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as invites from "../invites.js";
import type * as itinerary from "../itinerary.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_blocks from "../lib/blocks.js";
import type * as lib_changes from "../lib/changes.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_profile from "../lib/profile.js";
import type * as media from "../media.js";
import type * as moments from "../moments.js";
import type * as quota from "../quota.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  changes: typeof changes;
  crons: typeof crons;
  events: typeof events;
  invites: typeof invites;
  itinerary: typeof itinerary;
  "lib/access": typeof lib_access;
  "lib/blocks": typeof lib_blocks;
  "lib/changes": typeof lib_changes;
  "lib/crypto": typeof lib_crypto;
  "lib/limits": typeof lib_limits;
  "lib/profile": typeof lib_profile;
  media: typeof media;
  moments: typeof moments;
  quota: typeof quota;
  sessions: typeof sessions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  oauthGithub: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGithub">;
  oauthGoogle: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGoogle">;
  email: import("../components/email/_generated/component.js").ComponentApi<"email">;
  invites: import("../components/invites/_generated/component.js").ComponentApi<"invites">;
};
