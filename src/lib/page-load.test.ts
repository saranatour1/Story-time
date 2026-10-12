// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string): string => {
  return readFileSync(path, "utf8");
};

describe("page load", () => {
  it("keeps scrapbook fonts off the global stylesheet", () => {
    const global = source("src/styles.css");
    for (const face of ["caveat", "special-elite", "libre-caslon-text", "oswald"]) {
      expect(global).not.toContain(face);
    }
    expect(global).toContain("@fontsource-variable/manrope");
    expect(global).toContain("@fontsource-variable/newsreader/opsz.css");
    const scrapbook = source("src/components/journal/journal-fonts.css");
    for (const face of ["caveat", "special-elite", "libre-caslon-text", "oswald"]) {
      expect(scrapbook).toContain(face);
    }
    expect(source("src/components/journal/page.tsx")).toContain("journal-fonts.css?url");
  });

  it("preloads the latin faces the first paint uses", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain("manrope-latin-wght-normal.woff2?url");
    expect(root).toContain("newsreader-latin-opsz-normal.woff2?url");
    expect(root).toContain('rel: "preload"');
    expect(root).toContain('as: "font"');
  });

  it("loads the heavy libraries in their own chunks", () => {
    const editor = source("src/components/journal/editor.tsx");
    expect(editor).not.toMatch(/^import Moveable from "react-moveable"/m);
    expect(editor).toContain('import("react-moveable")');

    const elements = source("src/components/journal/elements.tsx");
    expect(elements).not.toContain('StickyMap } from "@/components/story/memoir/sticky-map"');
    expect(elements).toContain('import("@/components/story/memoir/sticky-map")');

    const share = source("src/routes/s.tsx");
    expect(share).not.toContain('from "@/components/story/story-player"');
    expect(share).toContain('import("@/components/story/story-player")');

    const story = source("src/routes/e.$id.story.tsx");
    expect(story).not.toContain('from "@/components/story/story-player"');
    expect(story).not.toContain('from "@/components/story/story-scroll"');
    expect(story).toContain('import("@/components/story/story-player")');
    expect(story).toContain('import("@/components/story/story-scroll")');

    const exp = source("src/components/journal/export.ts");
    // The journal PDF is assembled in its own module. jsPDF is not on this path.
    expect(exp).toContain('from "./pdf-book"');
    expect(exp).not.toContain('from "jspdf"');
    expect(exp).toContain('import("modern-screenshot")');
    expect(source("src/components/journal/cutter.tsx")).toContain('import("@mediapipe/tasks-vision")');
    expect(source("src/router.tsx")).toContain('defaultPreload: "intent"');
  });
});
