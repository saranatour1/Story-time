import { afterEach, describe, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  delete process.env.APP_URL;
});

describe("appOrigins", () => {
  test("unset APP_URL falls back to local dev, and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { appOrigins } = await import("../lib/appUrl");
    expect(appOrigins()).toEqual(["http://localhost:3000"]);
    expect(appOrigins()).toEqual(["http://localhost:3000"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a set APP_URL is used as given, with no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    // eslint-disable-next-line @convex-dev/no-process-env -- test setup
    process.env.APP_URL = "https://story.example.com/, https://www.example.com/path";
    const { appOrigins } = await import("../lib/appUrl");
    expect(appOrigins()).toEqual(["https://story.example.com", "https://www.example.com"]);
    expect(warn).not.toHaveBeenCalled();
  });
});
