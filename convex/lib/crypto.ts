import type { Infer } from "convex/values";
import { env } from "../_generated/server";
import { vEncrypted } from "../schema";

export type Encrypted = Infer<typeof vEncrypted>;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function masterKey(): Promise<CryptoKey> {
  const raw = env.ENCRYPTION_MASTER_KEY;
  return crypto.subtle.importKey("raw", fromB64(raw), "HKDF", false, [
    "deriveKey",
  ]);
}

// One AES-GCM key per (event, key version), derived from the master key, so
// no per-event key is ever stored. Bump `events.keyVersion` to rotate.
async function eventKey(eventId: string, version: number): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("storytime/event"),
      info: enc.encode(`${eventId}:${version}`),
    },
    await masterKey(),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(
  eventId: string,
  version: number,
  plaintext: string,
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await eventKey(eventId, version),
    enc.encode(plaintext),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)), v: version };
}

export async function decryptText(
  eventId: string,
  value: Encrypted,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(value.iv) },
    await eventKey(eventId, value.v),
    fromB64(value.ct),
  );
  return dec.decode(pt);
}

// Keyed hash so equal places group together without storing the place.
export async function placeKeyFor(
  eventId: string,
  version: number,
  place: string,
): Promise<string> {
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("storytime/place"),
      info: enc.encode(`${eventId}:${version}`),
    },
    await masterKey(),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(place.trim().toLowerCase()),
  );
  return toB64(new Uint8Array(sig)).slice(0, 22);
}
