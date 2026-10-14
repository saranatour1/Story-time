/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import readme from "../README.md?raw";

// The rules in convex/README.md, checked, so the folder stays the way the map
// says and the map stays complete.

const sources = import.meta.glob(
  ["../**/*.ts", "!../_generated/**", "!../components/**", "!../tests/**"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const files = Object.entries(sources).map(([path, text]) => ({
  path: path.replace(/^\.\.\//, ""),
  text,
}));
const under = (folder: string) => files.filter((f) => f.path.startsWith(`${folder}/`));

const DEFINES =
  /=\s*(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\(/;
const PUBLIC_EXPORT = /^export const \w+ = (query|mutation|action)\(/m;
const ROOT = new Set([
  "schema.ts",
  "convex.config.ts",
  "auth.ts",
  "auth.config.ts",
  "http.ts",
  "crons.ts",
]);

describe("convex/ layout", () => {
  test("it reads the folder (so the checks below aren't vacuous)", () => {
    expect(under("api").length).toBeGreaterThan(10);
    expect(under("model").length).toBeGreaterThan(10);
    expect(under("lib").length).toBeGreaterThan(10);
  });

  test("the root holds only the files Convex reads from there", () => {
    const root = files.filter((f) => !f.path.includes("/")).map((f) => f.path);
    expect(root.filter((p) => !ROOT.has(p))).toEqual([]);
  });

  test("api/ only re-exports: one `export const { … } = …Api` statement per file", () => {
    for (const { path, text } of under("api")) {
      // A formatter may wrap the statement; join it back into one line.
      const code = text
        .split("\n")
        .filter(
          (line) =>
            line.trim() !== "" && !line.trim().startsWith("//") && !line.startsWith("import "),
        )
        .map((line) => line.trim())
        .join(" ");
      expect(code, path).toMatch(/^export const \{ ?[\w, ]+ ?\} = \w+Api;$/);
    }
  });

  test("model/ exports public functions only through its …Api object", () => {
    for (const { path, text } of under("model")) expect(PUBLIC_EXPORT.test(text), path).toBe(false);
  });

  test("lib/ defines no Convex functions", () => {
    for (const { path, text } of under("lib")) expect(DEFINES.test(text), path).toBe(false);
  });

  test("the map in convex/README.md names every file", () => {
    const missing = [...under("api"), ...under("model"), ...under("lib")]
      .map((f) => f.path)
      .filter((p) => !readme.includes(`\`${p}\``));
    expect(missing).toEqual([]);
  });
});
