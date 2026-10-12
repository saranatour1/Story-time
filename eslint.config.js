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
    files: ["**/*.{ts,tsx}"],
    // Functions are arrow functions: `const name = () => {}`, never
    // `function name() {}`. A rare exception (a generator, an overload, an
    // assertion function) says why on an eslint-disable line.
    rules: { "func-style": ["error", "expression"] },
  },
  ...convexPlugin.configs.recommended,
]);
