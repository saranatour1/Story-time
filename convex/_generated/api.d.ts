/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_apply from "../ai/apply.js";
import type * as ai_command from "../ai/command.js";
import type * as ai_decide from "../ai/decide.js";
import type * as ai_enrich from "../ai/enrich.js";
import type * as ai_generate from "../ai/generate.js";
import type * as ai_models from "../ai/models.js";
import type * as ai_scribe from "../ai/scribe.js";
import type * as ai_publicFetch from "../ai/publicFetch.js";
import type * as ai_title from "../ai/title.js";
import type * as ai_unfurl from "../ai/unfurl.js";
import type * as ai_voice from "../ai/voice.js";
import type * as auth from "../auth.js";
import type * as changes from "../changes.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as guestNotes from "../guestNotes.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as journal from "../journal.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_actors from "../lib/actors.js";
import type * as lib_appUrl from "../lib/appUrl.js";
import type * as lib_blocks from "../lib/blocks.js";
import type * as lib_changes from "../lib/changes.js";
import type * as lib_cover from "../lib/cover.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_emailAddress from "../lib/emailAddress.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_journal from "../lib/journal.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_monthDay from "../lib/monthDay.js";
import type * as lib_profile from "../lib/profile.js";
import type * as lib_publicWeb from "../lib/publicWeb.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_seeded from "../lib/seeded.js";
import type * as lib_sharedPdf from "../lib/sharedPdf.js";
import type * as media from "../media.js";
import type * as migrations from "../migrations.js";
import type * as moments from "../moments.js";
import type * as onThisDay from "../onThisDay.js";
import type * as pdf from "../pdf.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as share from "../share.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/apply": typeof ai_apply;
  "ai/command": typeof ai_command;
  "ai/decide": typeof ai_decide;
  "ai/enrich": typeof ai_enrich;
  "ai/generate": typeof ai_generate;
  "ai/models": typeof ai_models;
  "ai/publicFetch": typeof ai_publicFetch;
  "ai/scribe": typeof ai_scribe;
  "ai/title": typeof ai_title;
  "ai/unfurl": typeof ai_unfurl;
  "ai/voice": typeof ai_voice;
  auth: typeof auth;
  changes: typeof changes;
  crons: typeof crons;
  events: typeof events;
  guestNotes: typeof guestNotes;
  http: typeof http;
  invites: typeof invites;
  journal: typeof journal;
  "lib/access": typeof lib_access;
  "lib/actors": typeof lib_actors;
  "lib/appUrl": typeof lib_appUrl;
  "lib/blocks": typeof lib_blocks;
  "lib/changes": typeof lib_changes;
  "lib/cover": typeof lib_cover;
  "lib/crypto": typeof lib_crypto;
  "lib/emailAddress": typeof lib_emailAddress;
  "lib/geo": typeof lib_geo;
  "lib/journal": typeof lib_journal;
  "lib/limits": typeof lib_limits;
  "lib/monthDay": typeof lib_monthDay;
  "lib/profile": typeof lib_profile;
  "lib/publicWeb": typeof lib_publicWeb;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/seeded": typeof lib_seeded;
  "lib/sharedPdf": typeof lib_sharedPdf;
  media: typeof media;
  migrations: typeof migrations;
  moments: typeof moments;
  onThisDay: typeof onThisDay;
  pdf: typeof pdf;
  seed: typeof seed;
  sessions: typeof sessions;
  share: typeof share;
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
  authAnonymous: import("@convex-dev/auth/providers/anonymous/_generated/component.js").ComponentApi<"authAnonymous">;
  email: import("../components/email/_generated/component.js").ComponentApi<"email">;
  invites: import("../components/invites/_generated/component.js").ComponentApi<"invites">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
