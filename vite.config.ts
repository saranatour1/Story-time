import { defineConfig, loadEnv } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lazyPlugins } from "vite-plus";

const neverInlineFontsElseViteDefault = (file: string) =>
  file.endsWith(".woff2") ? false : undefined;

const config = defineConfig(({ command, mode }) => {
  if (command === "build" && !loadEnv(mode, process.cwd(), "VITE_").VITE_APP_URL) {
    console.warn("VITE_APP_URL isn't set: shared links won't show a preview image.");
  }
  return {
    resolve: { tsconfigPaths: true },
    fmt: { ignorePatterns: ["src/routeTree.gen.ts"] },
    build: { assetsInlineLimit: neverInlineFontsElseViteDefault },
    plugins: lazyPlugins(() => [
      devtools(),
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ]),
  };
});

export default config;
