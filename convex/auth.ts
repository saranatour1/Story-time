import { components, internal } from "./_generated/api";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { appOrigins } from "./lib/appUrl";

// Access tokens last 15 minutes rather than the default one, so a large
// upload streamed through the Worker can still be confirmed when it ends.
const core = setupConvexAuth({ component: components.auth, accessTokenTtlSeconds: 15 * 60 });
export const { signOut, refreshSession, isAuthenticated } = core;

// Set APP_URL on each deployment (comma-separated for several origins);
// unset means local dev.
const allowedRedirectOrigins = appOrigins();

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(core, {
  component: components.authGithub,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.model.users.createGithubUser });

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(core, {
  component: components.authGoogle,
  allowedRedirectOrigins,
}).attachUserCallbacks({ createUser: internal.model.users.createGoogleUser });

// Dev only: users.createAnonymousUser rejects unless ALLOW_ANONYMOUS_SIGNIN
// is "true" on the deployment, and the button only renders in dev builds.
export const { signInAnonymously } = setupAnonymous(core, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.model.users.createAnonymousUser });
