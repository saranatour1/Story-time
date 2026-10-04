import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupGithub } from "@convex-dev/auth/providers/oauth/github";
import { setupGoogle } from "@convex-dev/auth/providers/oauth/google";

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
