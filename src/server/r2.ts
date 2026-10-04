import { ConvexHttpClient } from "convex/browser";
import { env } from "cloudflare:workers";

const enc = new TextEncoder();

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Same master key as Convex, different HKDF salt: R2 objects and database
// fields never share a key. One key per (scope, key version), where the scope
// is an event id for moment photos and "avatar:<userId>" for profile images.
export async function ssecKeyFor(
  scope: string,
  version: number,
): Promise<ArrayBuffer> {
  const master = await crypto.subtle.importKey(
    "raw",
    fromB64(env.ENCRYPTION_MASTER_KEY),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("storytime/r2"),
      info: enc.encode(`${scope}:${version}`),
    },
    master,
    256,
  );
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

// A Convex client acting as the caller, so every check in convex/ applies.
export function convexAs(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
  client.setAuth(token);
  return client;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
