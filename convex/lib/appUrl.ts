import { env } from "../_generated/server";

const DEV_ORIGIN = "http://localhost:3000";

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

export const appOrigin = (): string => {
  return appOrigins()[0]!;
};
