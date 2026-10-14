import { env } from "../_generated/server";

const DEV_ORIGIN = "http://localhost:3000";

// Unset APP_URL means local dev, so it falls back to DEV_ORIGIN. A deployment
// that forgot to set it would fall back silently, so warn once per isolate.
// Convex gives no dev/prod signal to tell the two apart (both sites use
// *.convex.site), so the fallback itself stays.
let warnedFallback = false;
const fallbackOrigins = (): string[] => {
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      `APP_URL is missing or unusable, so the app origin falls back to ${DEV_ORIGIN}. Set APP_URL on every deployment that serves the site.`,
    );
  }
  return [DEV_ORIGIN];
};

// The web app's origins, from APP_URL: one URL, or several separated by
// commas (say the apex, www and the workers.dev address). Each may carry a
// trailing slash or a path; OAuth redirect checks and invite links only want
// the bare origin. A malformed entry is skipped with a log line rather than
// breaking every sign-in.
export const appOrigins = (): string[] => {
  const configured = env.APP_URL?.trim() ?? "";
  if (configured === "") return fallbackOrigins();
  const origins = configured.split(",").flatMap((raw) => {
    const url = raw.trim();
    if (!url) return [];
    try {
      return [new URL(url).origin];
    } catch {
      console.error(
        `APP_URL entry "${url}" isn't a URL; use the full origin, like https://example.com`,
      );
      return [];
    }
  });
  return origins.length > 0 ? origins : fallbackOrigins();
};

// The first origin is the one invite links point at.
export const appOrigin = (): string => {
  return appOrigins()[0]!;
};
