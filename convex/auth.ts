import { components, internal } from "./_generated/api";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { appOrigins } from "./lib/appUrl";

const core = setupConvexAuth({ component: components.auth, accessTokenTtlSeconds: 15 * 60 });
export const { signOut, refreshSession, isAuthenticated } = core;

const allowedRedirectOrigins = appOrigins();

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(core, {
  component: components.authGithub,
  allowedRedirectOrigins,
}).attachUserCallbacks({
  createUser: internal.model.users.createGithubUser,
  onSignIn: internal.model.users.saveOauthProfile,
});

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(core, {
  component: components.authGoogle,
  allowedRedirectOrigins,
}).attachUserCallbacks({
  createUser: internal.model.users.createGoogleUser,
  onSignIn: internal.model.users.saveOauthProfile,
});

export const { signInAnonymously } = setupAnonymous(core, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.model.users.createAnonymousUser });
