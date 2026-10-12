// Whether a web address is one this server may open. Shape checks live here so
// queries can use them. Looking the name up is a separate step: a hostname can
// pass every check below and still point at a machine on a private network.

const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;

const LOCAL_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".home.arpa", ".arpa"];

// The hostname a URL will actually be asked for: lower case, no brackets, no
// zone id, no trailing dots. `localhost.` and `[::1]` become `localhost` and `::1`.
export const bareHost = (host: string): string => {
  let name = host.trim().toLowerCase();
  if (name.startsWith("[") && name.endsWith("]")) name = name.slice(1, -1);
  const zone = name.indexOf("%");
  if (zone >= 0) name = name.slice(0, zone);
  while (name.endsWith(".")) name = name.slice(0, -1);
  return name;
};

const hostOf = (url: URL): string => {
  return bareHost(url.hostname);
};

// A single label that is only digits, or a hex number (`0x7f`). Octal-looking
// labels (`0177`) are digits too, so they are caught here without being decoded.
const isNumericLabel = (label: string): boolean => {
  return /^\d+$/.test(label) || /^0x[0-9a-f]+$/i.test(label);
};

// An address written as a number rather than a name: IPv6, a dotted quad, a
// short form (`127.1`), a single integer, or hex labels. All of them are
// refused, public ranges included. The fetch never opens a literal.
export const isLiteralAddress = (host: string): boolean => {
  const name = bareHost(host);
  if (name === "") return false;
  if (name.includes(":")) return true;
  const labels = name.split(".");
  return labels.length > 0 && labels.every(isNumericLabel);
};

// Web addresses only. Local names and numeric hosts are refused before DNS.
export const isPublicWebUrl = (url: URL): boolean => {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = hostOf(url);
  if (host === "" || host === "localhost") return false;
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  if (isLiteralAddress(host)) return false;
  return true;
};

// Where a redirect would send the next fetch, or nothing if that address is
// not one this server should open. The next hop is still looked up before use.
export const publicRedirect = (base: string, location: string): string | undefined => {
  try {
    const next = new URL(location, base);
    return isPublicWebUrl(next) ? next.href : undefined;
  } catch {
    return undefined;
  }
};

const parseV4 = (host: string): [number, number, number, number] | undefined => {
  const parts = host.split(".");
  if (parts.length !== 4) return undefined;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    nums.push(n);
  }
  return nums as [number, number, number, number];
};

const v4Private = (octets: [number, number, number, number]): boolean => {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
};

// Eight groups, or undefined when the text is not an IPv6 address. A dotted
// IPv4 tail (`::ffff:127.0.0.1`) is folded into the last two groups first.
const expandV6 = (host: string): number[] | undefined => {
  let text = bareHost(host);
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail?.[1] !== undefined && tail.index !== undefined) {
    const v4 = parseV4(tail[1]);
    if (v4 === undefined) return undefined;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, tail.index)}${hi}:${lo}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] === "" ? [] : (halves[0]?.split(":") ?? []);
  const right = halves.length === 1 ? [] : halves[1] === "" ? [] : (halves[1]?.split(":") ?? []);
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return undefined;
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return undefined;
  const nums: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return undefined;
    nums.push(Number.parseInt(group, 16));
  }
  return nums;
};

const v4FromGroups = (hi: number, lo: number): [number, number, number, number] => {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
};

const v6Private = (groups: readonly number[]): boolean => {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const restZero = g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0;
  if (g0 === 0 && restZero) return true;
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && g1 === 0x0db8) return true;
  // IPv4-mapped (::ffff:0:0/96) and 6to4 (2002::/16): the embedded address decides.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return v4Private(v4FromGroups(g6, g7));
  if (g0 === 0x2002) return v4Private(v4FromGroups(g1, g2));
  // NAT64 well-known prefix 64:ff9b::/96.
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return v4Private(v4FromGroups(g6, g7));
  return false;
};

// True for loopback, link-local, private, documentation, multicast, and anything
// that is not a readable address. An unknown string fails closed.
export const isPrivateIp = (address: string): boolean => {
  const host = bareHost(address);
  if (host === "") return true;
  if (host.includes(":")) {
    const groups = expandV6(host);
    return groups === undefined ? true : v6Private(groups);
  }
  const v4 = parseV4(host);
  return v4 === undefined ? true : v4Private(v4);
};

export type WebLookup = (host: string) => Promise<readonly string[]>;

export type WebResponse = {
  status: number;
  url: string;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
};

export type WebFetch = (
  url: URL,
  init: { signal: AbortSignal; redirect: "manual"; addresses: readonly string[] },
) => Promise<WebResponse>;

export type PinnedAddress = { address: string; family: 4 | 6 };

// The addresses a connection may use. Empty, mixed, or private answers pin
// nothing: the caller must fail closed instead of looking the name up again.
export const addressesToPin = (addresses: readonly string[]): readonly PinnedAddress[] | undefined => {
  if (addresses.length === 0) return undefined;
  const pinned: PinnedAddress[] = [];
  for (const address of addresses) {
    if (isPrivateIp(address)) return undefined;
    pinned.push({ address, family: address.includes(":") ? 6 : 4 });
  }
  return pinned;
};

// A DNS callback that can only return `addresses`. It never asks the network.
export const connectLookup = (
  addresses: readonly string[],
):
  | ((
      hostname: string,
      options: { all?: boolean },
      callback: (err: Error | null, address: string | readonly PinnedAddress[], family?: number) => void,
    ) => void)
  | undefined => {
  const pinned = addressesToPin(addresses);
  if (pinned === undefined) return undefined;
  return (hostname, options, callback) => {
    void hostname;
    if (options.all === true) {
      callback(null, pinned);
      return;
    }
    const first = pinned[0];
    if (first === undefined) {
      callback(new Error("no pinned address"), "");
      return;
    }
    callback(null, first.address, first.family);
  };
};

// Every address the name resolves to must be a public one. A lookup that fails
// or returns nothing is treated as private: the page is not fetched.
const publicAddresses = async (url: URL, resolve: WebLookup): Promise<readonly string[] | undefined> => {
  if (!isPublicWebUrl(url)) return undefined;
  let addresses: readonly string[];
  try {
    addresses = await resolve(hostOf(url));
  } catch {
    return undefined;
  }
  if (addressesToPin(addresses) === undefined) return undefined;
  return addresses;
};

// Fetches a public page, following redirects by hand. Each hop is looked up,
// and the connection is given only those addresses so a later DNS answer
// cannot point it somewhere else. The address the response says it landed on
// is checked the same way.
export const readPublicPage = async (
  raw: string,
  limit: number,
  deps: { resolve: WebLookup; fetch: WebFetch },
): Promise<{ html: string; url: string } | null> => {
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const addresses = await publicAddresses(current, deps.resolve);
    if (addresses === undefined) return null;
    let response: WebResponse;
    try {
      response = await deps.fetch(current, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        addresses,
      });
    } catch {
      return null;
    }
    let landed = current;
    if (response.url !== "") {
      try {
        landed = new URL(response.url);
      } catch {
        return null;
      }
    }
    if ((await publicAddresses(landed, deps.resolve)) === undefined) return null;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null || location === "") return null;
      const next = publicRedirect(landed.href, location);
      if (next === undefined) return null;
      current = new URL(next);
      continue;
    }
    if (!response.ok || response.body === null) return null;
    return { html: await readHead(response.body, limit), url: landed.href };
  }
  return null;
};

// Reads up to `limit` bytes, then stops the download.
export const readHead = async (body: ReadableStream<Uint8Array>, limit: number): Promise<string> => {
  const reader = body.getReader();
  const buffer = new Uint8Array(limit);
  let filled = 0;
  while (filled < limit) {
    const { done, value } = await reader.read();
    if (done || value === undefined) break;
    const n = Math.min(value.byteLength, limit - filled);
    buffer.set(value.subarray(0, n), filled);
    filled += n;
  }
  await reader.cancel();
  return new TextDecoder().decode(buffer.subarray(0, filled));
};
