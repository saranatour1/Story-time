import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    ".claude/",
    "dist/",
    ".output/",
    ".tanstack/",
    "src/routeTree.gen.ts",
    "convex/_generated/",
    "convex/components/*/_generated/",
    "src/components/ui/",
    "worker-configuration.d.ts",
    "public/maplibre-gl-worker.mjs",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "func-style": ["error", "expression"] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "convex/react",
              importNames: ["useQuery", "useQueries"],
              message:
                "Use useQuery(queries.x.y(args)) from @tanstack/react-query; the factories are in src/lib/queries.ts.",
            },
          ],
        },
      ],
    },
  },
  ...convexPlugin.configs.recommended,
  {
    files: ["convex/tests/**/*.ts"],
    rules: { "@convex-dev/no-process-env": "off" },
  },
]);
