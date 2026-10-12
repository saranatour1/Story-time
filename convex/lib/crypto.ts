import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { env } from "../_generated/server";
import { vEncrypted, vGeo } from "../schema";

export type Encrypted = Infer<typeof vEncrypted>;
export type Geo = Infer<typeof vGeo>;

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

// Derivation is deterministic, so each key is derived once per isolate
// instead of on every encrypt/decrypt. Resolved keys only (not promises), and
// dropped if the master key changes.
const keys = new Map<string, CryptoKey>();
let keysFor: string | undefined;

async function cached(
  id: string,
  derive: () => Promise<CryptoKey>,
): Promise<CryptoKey> {
  if (keysFor !== env.ENCRYPTION_MASTER_KEY) {
    keys.clear();
    keysFor = env.ENCRYPTION_MASTER_KEY;
  }
  let key = keys.get(id);
  if (key === undefined) {
    key = await derive();
    keys.set(id, key);
  }
  return key;
}

async function masterKey(): Promise<CryptoKey> {
  return cached("master", () =>
    crypto.subtle.importKey(
      "raw",
      fromB64(env.ENCRYPTION_MASTER_KEY),
      "HKDF",
      false,
      ["deriveKey"],
    ),
  );
}

// One AES-GCM key per (event, key version), derived from the master key, so
// no per-event key is ever stored. Bump `events.keyVersion` to rotate.
async function eventKey(eventId: string, version: number): Promise<CryptoKey> {
  return cached(`event:${eventId}:${version}`, async () =>
    crypto.subtle.deriveKey(
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
    ),
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

// Free text that newer rows keep under the event key and older ones still hold
// as plain text: reads either way.
export async function readText(
  eventId: Id<"events">,
  value: string | Encrypted | undefined,
): Promise<string | undefined> {
  if (value === undefined || typeof value === "string") return value;
  return decryptText(eventId, value);
}

// Coordinates are stored as "lat,lng" text under the event key, like the
// place they pin. A malformed value reads as no pin.
export async function encryptGeo(
  eventId: string,
  version: number,
  geo: Geo,
): Promise<Encrypted> {
  return encryptText(eventId, version, `${geo.lat},${geo.lng}`);
}

export async function decryptGeo(
  eventId: string,
  value: Encrypted,
): Promise<Geo | undefined> {
  const [lat, lng] = (await decryptText(eventId, value)).split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

// Finds an experience from its share link without keeping the token: a keyed
// hash of it. Derived from the master key alone, since the experience isn't
// known yet when a link is opened.
export async function shareKeyFor(token: string): Promise<string> {
  const key = await cached("share", async () =>
    crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode("storytime/share"),
        info: enc.encode("share"),
      },
      await masterKey(),
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign"],
    ),
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return toB64(new Uint8Array(sig)).slice(0, 22);
}

// A confirmation link, hashed the same way as a share link but with its own
// key, so one token cannot stand in for the other.
export async function emailKeyFor(token: string): Promise<string> {
  const key = await cached("email", async () =>
    crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode("storytime/email"),
        info: enc.encode("email"),
      },
      await masterKey(),
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign"],
    ),
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return toB64(new Uint8Array(sig)).slice(0, 22);
}

