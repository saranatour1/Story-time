import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { env } from "../_generated/server";
import { vEncrypted, vGeo } from "../schema";

export type Encrypted = Infer<typeof vEncrypted>;
export type Geo = Infer<typeof vGeo>;

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const keys = new Map<string, CryptoKey>();
let keysFor: string | undefined;

const cached = async (id: string, derive: () => Promise<CryptoKey>): Promise<CryptoKey> => {
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
};

const masterKey = async (): Promise<CryptoKey> => {
  return cached("master", () =>
    crypto.subtle.importKey("raw", fromB64(env.ENCRYPTION_MASTER_KEY), "HKDF", false, [
      "deriveKey",
    ]),
  );
};

const eventKey = async (eventId: string, version: number): Promise<CryptoKey> => {
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
};

export const encryptText = async (
  eventId: string,
  version: number,
  plaintext: string,
): Promise<Encrypted> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await eventKey(eventId, version),
    enc.encode(plaintext),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)), v: version };
};

export const decryptText = async (eventId: string, value: Encrypted): Promise<string> => {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(value.iv) },
    await eventKey(eventId, value.v),
    fromB64(value.ct),
  );
  return dec.decode(pt);
};

export const readText = async (
  eventId: Id<"events">,
  value: string | Encrypted | undefined,
): Promise<string | undefined> => {
  if (value === undefined || typeof value === "string") return value;
  return decryptText(eventId, value);
};

export const encryptGeo = async (
  eventId: string,
  version: number,
  geo: Geo,
): Promise<Encrypted> => {
  return encryptText(eventId, version, `${geo.lat},${geo.lng}`);
};

export const decryptGeo = async (eventId: string, value: Encrypted): Promise<Geo | undefined> => {
  const [lat, lng] = (await decryptText(eventId, value)).split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
};

export const shareKeyFor = async (token: string): Promise<string> => {
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
};

export const emailKeyFor = async (token: string): Promise<string> => {
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
};
