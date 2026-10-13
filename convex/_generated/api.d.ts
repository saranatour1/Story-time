/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_ai_command from "../api/ai/command.js";
import type * as api_ai_enrich from "../api/ai/enrich.js";
import type * as api_ai_title from "../api/ai/title.js";
import type * as api_ai_voice from "../api/ai/voice.js";
import type * as api_changes from "../api/changes.js";
import type * as api_events from "../api/events.js";
import type * as api_guestNotes from "../api/guestNotes.js";
import type * as api_invites from "../api/invites.js";
import type * as api_journal from "../api/journal.js";
import type * as api_media from "../api/media.js";
import type * as api_moments from "../api/moments.js";
import type * as api_pdf from "../api/pdf.js";
import type * as api_sessions from "../api/sessions.js";
import type * as api_share from "../api/share.js";
import type * as api_users from "../api/users.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_actors from "../lib/actors.js";
import type * as lib_ai_budget from "../lib/ai/budget.js";
import type * as lib_ai_generate from "../lib/ai/generate.js";
import type * as lib_ai_models from "../lib/ai/models.js";
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
import type * as model_ai_apply from "../model/ai/apply.js";
import type * as model_ai_command from "../model/ai/command.js";
import type * as model_ai_decide from "../model/ai/decide.js";
import type * as model_ai_enrich from "../model/ai/enrich.js";
import type * as model_ai_publicFetch from "../model/ai/publicFetch.js";
import type * as model_ai_scribe from "../model/ai/scribe.js";
import type * as model_ai_title from "../model/ai/title.js";
import type * as model_ai_unfurl from "../model/ai/unfurl.js";
import type * as model_ai_voice from "../model/ai/voice.js";
import type * as model_aiBudget from "../model/aiBudget.js";
import type * as model_changes from "../model/changes.js";
import type * as model_events from "../model/events.js";
import type * as model_guestNotes from "../model/guestNotes.js";
import type * as model_invites from "../model/invites.js";
import type * as model_journal from "../model/journal.js";
import type * as model_media from "../model/media.js";
import type * as model_migrations from "../model/migrations.js";
import type * as model_moments from "../model/moments.js";
import type * as model_onThisDay from "../model/onThisDay.js";
import type * as model_pdf from "../model/pdf.js";
import type * as model_seed from "../model/seed.js";
import type * as model_sessions from "../model/sessions.js";
import type * as model_share from "../model/share.js";
import type * as model_users from "../model/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/ai/command": typeof api_ai_command;
  "api/ai/enrich": typeof api_ai_enrich;
  "api/ai/title": typeof api_ai_title;
  "api/ai/voice": typeof api_ai_voice;
  "api/changes": typeof api_changes;
  "api/events": typeof api_events;
  "api/guestNotes": typeof api_guestNotes;
  "api/invites": typeof api_invites;
  "api/journal": typeof api_journal;
  "api/media": typeof api_media;
  "api/moments": typeof api_moments;
  "api/pdf": typeof api_pdf;
  "api/sessions": typeof api_sessions;
  "api/share": typeof api_share;
  "api/users": typeof api_users;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/actors": typeof lib_actors;
  "lib/ai/budget": typeof lib_ai_budget;
  "lib/ai/generate": typeof lib_ai_generate;
  "lib/ai/models": typeof lib_ai_models;
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
  "model/ai/apply": typeof model_ai_apply;
  "model/ai/command": typeof model_ai_command;
  "model/ai/decide": typeof model_ai_decide;
  "model/ai/enrich": typeof model_ai_enrich;
  "model/ai/publicFetch": typeof model_ai_publicFetch;
  "model/ai/scribe": typeof model_ai_scribe;
  "model/ai/title": typeof model_ai_title;
  "model/ai/unfurl": typeof model_ai_unfurl;
  "model/ai/voice": typeof model_ai_voice;
  "model/aiBudget": typeof model_aiBudget;
  "model/changes": typeof model_changes;
  "model/events": typeof model_events;
  "model/guestNotes": typeof model_guestNotes;
  "model/invites": typeof model_invites;
  "model/journal": typeof model_journal;
  "model/media": typeof model_media;
  "model/migrations": typeof model_migrations;
  "model/moments": typeof model_moments;
  "model/onThisDay": typeof model_onThisDay;
  "model/pdf": typeof model_pdf;
  "model/seed": typeof model_seed;
  "model/sessions": typeof model_sessions;
  "model/share": typeof model_share;
  "model/users": typeof model_users;
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
  aiBudget: import("@convex-dev/ai-budget/_generated/component.js").ComponentApi<"aiBudget">;
};
