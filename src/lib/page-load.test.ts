// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const source = (path: string): string => {
  return readFileSync(path, "utf8");
};

describe("page load", () => {
  it("preloads the latin faces the first paint uses", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain("manrope-latin-wght-normal.woff2?url");
    expect(root).toContain("newsreader-latin-opsz-normal.woff2?url");
    expect(root).toContain('rel: "preload"');
    expect(root).toContain('as: "font"');
  });

  it("loads the heavy libraries in their own chunks", () => {
    const share = source("src/routes/s.{-$name}.tsx");
    expect(share).not.toContain('from "@/components/story/story-player"');
    expect(share).not.toContain('from "@/components/story/story-scroll"');
    expect(share).toContain('import("@/components/story/story-player")');
    expect(share).toContain('import("@/components/story/story-scroll")');

    const story = source("src/routes/e.$id.story.tsx");
    expect(story).not.toContain('from "@/components/story/story-player"');
    expect(story).not.toContain('from "@/components/story/story-scroll"');
    expect(story).toContain('import("@/components/story/story-player")');
    expect(story).toContain('import("@/components/story/story-scroll")');

    expect(source("src/router.tsx")).toContain('defaultPreload: "intent"');
  });
});
