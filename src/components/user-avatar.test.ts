import { expect, test } from "vite-plus/test";
import { initials } from "./user-avatar";

test("initials takes the first letter of the first two words", () => {
  expect(initials("Sara Natour")).toBe("SN");
  expect(initials("  ada   lovelace  byron ")).toBe("AL");
  expect(initials(undefined)).toBe("");
  expect(initials("   ")).toBe("");
});

test("initials keeps a visible character whole", () => {
  const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
  const flag = "\u{1F1F5}\u{1F1F9}";
  expect(initials(`${family}smith ${flag}land`)).toBe(family + flag);
  expect(initials("émilie")).toBe("É");
});
