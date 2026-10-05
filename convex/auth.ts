import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupGithub } from "@convex-dev/auth/providers/oauth/github";
import { setupGoogle } from "@convex-dev/auth/providers/oauth/google";
import { setupAnonymous } from "@convex-dev/auth/providers/anonymous/setup";

const core = setupCore({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = core;

// Add the production origin here when deploying.
const allowedRedirectOrigins = ["http://localhost:3000"];

export const { startSignInGithub, completeSignInGithub } = setupGithub(core, {
  component: components.oauthGithub,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.users.createGithubUser });

export const { startSignInGoogle, completeSignInGoogle } = setupGoogle(core, {
  component: components.oauthGoogle,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.users.createGoogleUser });

// Dev only: users.createAnonymousUser rejects unless ALLOW_ANONYMOUS_SIGNIN
// is "true" on the deployment, and the button only renders in dev builds.
export const { signInAnonymous } = setupAnonymous(core, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createAnonymousUser });
