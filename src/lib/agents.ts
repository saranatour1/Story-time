export const READ_SCOPE = "moments:read";
export const WRITE_SCOPE = "moments:write";

export const can = (scopes: string[]): string => {
  return scopes.includes(WRITE_SCOPE) ? "Can read and change" : "Can read";
};

// Where a consent answer is sent. An agent on this computer listens on
// localhost; a desktop app uses its own link type.
export const returnsTo = (redirectUri: string): string => {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "an app on this device";
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? "an app on this computer"
      : url.hostname;
  } catch {
    return "an unknown address";
  }
};
