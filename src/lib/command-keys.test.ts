import { describe, expect, test } from "vitest";
import { commandTakesSlash, pageClaimsSlash, wantsCommand } from "./command-keys";

const press = (
  key: string,
  target: { tagName?: string; isContentEditable?: boolean } | null,
  extra: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
) =>
  wantsCommand({
    key,
    target,
    metaKey: extra.metaKey ?? false,
    ctrlKey: extra.ctrlKey ?? false,
    altKey: extra.altKey ?? false,
  });

describe("wantsCommand", () => {
  test("slash focuses the box, and not while typing or with a modifier", () => {
    expect(press("/", null)).toBe(true);
    expect(press("/", { tagName: "BODY" })).toBe(true);
    expect(press("/", { tagName: "INPUT" })).toBe(false);
    expect(press("/", { tagName: "TEXTAREA" })).toBe(false);
    expect(press("/", { tagName: "SELECT" })).toBe(false);
    expect(press("/", { tagName: "DIV", isContentEditable: true })).toBe(false);
    expect(press("k", { tagName: "BODY" })).toBe(false);
    expect(press("/", { tagName: "BODY" }, { metaKey: true })).toBe(false);
    expect(press("/", { tagName: "BODY" }, { ctrlKey: true })).toBe(false);
    expect(press("/", { tagName: "BODY" }, { altKey: true })).toBe(false);
  });

  test("slash stays with moment search when that field already owns it", () => {
    const event = {
      key: "/",
      target: { tagName: "BODY" },
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    };
    expect(commandTakesSlash(event, true)).toBe(false);
    expect(commandTakesSlash(event, false)).toBe(true);
    expect(commandTakesSlash({ ...event, key: "k" }, false)).toBe(false);
    const owned = { querySelectorAll: () => [{ getAttribute: () => "/" }] };
    const free = { querySelectorAll: () => [{ getAttribute: () => "?" }] };
    expect(pageClaimsSlash(owned)).toBe(true);
    expect(pageClaimsSlash(free)).toBe(false);
    expect(pageClaimsSlash(undefined)).toBe(false);
  });
});
