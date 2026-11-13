import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config.js";
import cloudflareEmail from "@sarant/cloudflare-email-component/convex.config.js";
import invites from "./components/invites/convex.config";
import github from "@convex-dev/auth/components/github/convex.config.js";
import google from "@convex-dev/auth/components/google/convex.config.js";
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    ENCRYPTION_MASTER_KEY: v.string(),
    APP_URL: v.optional(v.string()),
    // Dev only: set to "true" to allow anonymous sign-in. Leave unset in prod.
    ALLOW_ANONYMOUS_SIGNIN: v.optional(v.string()),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    // Cloudflare Email Service; optional until sending is set up.
    CF_ACCOUNT_ID: v.optional(v.string()),
    CF_EMAIL_TOKEN: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});

// Callback URLs: https://<deployment>.convex.site/oauth/{github,google}/callback
app.use(github, {
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
});

app.use(google, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
});

app.use(authAnonymous);

// Sends through Cloudflare Email Sending (model/mail.ts), which passes the
// account and token on each send, so nothing is bound here.
app.use(cloudflareEmail);
app.use(invites);
// Per-person allowances (convex/lib/rateLimit.ts).
app.use(rateLimiter);

// Running counts and sums (lib/aggregates.ts): a person's upload bytes, an
// experience's photos and videos, and its changes by who made them.
app.use(aggregate, { name: "uploadBytes" });
app.use(aggregate, { name: "eventMedia" });
app.use(aggregate, { name: "changeCounts" });

export default app;
