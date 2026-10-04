export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_DISPLAY_NAME = 60;
export const MAX_EMAIL = 254;

// "" clears a field, so users can remove what they added.
export function cleanUsername(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  return value === "" ? undefined : value;
}

export function cleanEmail(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  return value === "" ? undefined : value;
}
