import { defineComponent } from "convex/server";
import { v } from "convex/values";

// Optional so the app deploys before Cloudflare Email is set up; sending
// fails with a clear error until all three are configured.
export default defineComponent("email", {
  env: {
    CF_ACCOUNT_ID: v.optional(v.string()),
    CF_EMAIL_TOKEN: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
  },
});
