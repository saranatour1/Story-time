import { describe, expect, test } from "vitest";
import { pageMeta } from "./seo";

describe("pageMeta", () => {
  test("only the home page is indexed", () => {
    expect(pageMeta("/").index).toBe(true);
    for (const path of ["/home", "/e/abc", "/e/abc/journal", "/settings/profile", "/s", "/invite/tok", "/verify-email"]) {
      expect(pageMeta(path).index, path).toBe(false);
    }
  });

  test("shared and invite links get their own card, and never a trip's details", () => {
    expect(pageMeta("/s").image).toBe("/og-share.png");
    expect(pageMeta("/e/abc/story").image).toBe("/og-share.png");
    expect(pageMeta("/invite/tok").image).toBe("/og-invite.png");
    expect(pageMeta("/invite").image).toBe("/og-invite.png");
    expect(pageMeta("/e/abc/journal").image).toBe("/og.png");
  });
});
