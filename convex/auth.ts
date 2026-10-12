import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupGithub } from "@convex-dev/auth/providers/oauth/github";
import { setupGoogle } from "@convex-dev/auth/providers/oauth/google";
import { setupAnonymous } from "@convex-dev/auth/providers/anonymous/setup";
import { appOrigins } from "./lib/appUrl";

// Access tokens last 15 minutes rather than the default one, so a large
// upload streamed through the Worker can still be confirmed when it ends.
const core = setupCore({ component: components.auth, accessTokenTtlSeconds: 15 * 60 });
export const { signOut, refreshSession, isAuthenticated } = core;

// Set APP_URL on each deployment (comma-separated for several origins);
// unset means local dev.
const allowedRedirectOrigins = appOrigins();

export const { startSignInGithub, completeSignInGithub } = setupGithub(core, {
  component: components.oauthGithub,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.model.users.createGithubUser });

export const { startSignInGoogle, completeSignInGoogle } = setupGoogle(core, {
  component: components.oauthGoogle,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.model.users.createGoogleUser });

// Dev only: users.createAnonymousUser rejects unless ALLOW_ANONYMOUS_SIGNIN
// is "true" on the deployment, and the button only renders in dev builds.
export const { signInAnonymous } = setupAnonymous(core, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.model.users.createAnonymousUser });
