import { afterEach, expect, test, vi } from "vite-plus/test";
import { forgetStored, readStored, writeStored } from "./storage";

afterEach(() => vi.unstubAllGlobals());

test("blocked storage reads as nothing kept and reports the failed write", () => {
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
  expect(readStored("session", "k")).toBeNull();
  expect(writeStored("session", "k", "v")).toBe(false);
  expect(forgetStored("session", "k")).toBe(false);
});

test("working storage round-trips", () => {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
    removeItem: (key: string) => kept.delete(key),
  });
  expect(writeStored("local", "k", "v")).toBe(true);
  expect(readStored("local", "k")).toBe("v");
  expect(forgetStored("local", "k")).toBe(true);
  expect(readStored("local", "k")).toBeNull();
});
