import { ConvexHttpClient } from "convex/browser";
import { env } from "cloudflare:workers";

const enc = new TextEncoder();

const R2_HKDF_SALT = "storytime/r2";

const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const ssecKeyFor = async (scope: string, version: number): Promise<ArrayBuffer> => {
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
      salt: enc.encode(R2_HKDF_SALT),
      info: enc.encode(`${scope}:${version}`),
    },
    master,
    256,
  );
};

export const bearerToken = (request: Request): string | null => {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
};

export const shareToken = (request: Request): string | null => {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Share ") ? header.slice(6) : null;
};

export const convexAs = (token: string): ConvexHttpClient => {
  const client = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
  client.setAuth(token);
  return client;
};

export const convexAnonymous = (): ConvexHttpClient => {
  return new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
};

export const json = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
