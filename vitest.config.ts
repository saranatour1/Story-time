import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    env: { CF_ACCOUNT_ID: "", CF_EMAIL_TOKEN: "", EMAIL_FROM: "" },
  },
});
