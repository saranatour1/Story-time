"use node";

import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import {
  connectLookup,
  readPublicPage,
  type WebFetch,
  type WebResponse,
} from "../../lib/publicWeb";

const headerValue = (value: string | string[] | undefined): string | null => {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
};

const fetchPinned: WebFetch = (url, init) => {
  const lookup = connectLookup(init.addresses);
  if (lookup === undefined)
    return Promise.reject(
      new Error("Refusing a connection that is not pinned to public addresses"),
    );
  return new Promise((resolve, reject) => {
    const onResponse = (res: http.IncomingMessage) => {
      const status = res.statusCode ?? 0;
      const body = Readable.toWeb(res) as ReadableStream<Uint8Array>;
      const response: WebResponse = {
        status,
        ok: status >= 200 && status < 300,
        url: url.href,
        headers: { get: (name) => headerValue(res.headers[name.toLowerCase()]) },
        body,
      };
      resolve(response);
    };
    const options = {
      method: "GET" as const,
      lookup: lookup as LookupFunction,
      signal: init.signal,
      headers: { accept: "text/html,application/xhtml+xml" },
    };
    const req =
      url.protocol === "https:"
        ? https.request(url, { ...options, servername: url.hostname }, onResponse)
        : http.request(url, options, onResponse);
    req.on("error", reject);
    req.end();
  });
};

export const fetchPage = internalAction({
  args: { url: v.string(), limit: v.number() },
  returns: v.union(v.null(), v.object({ html: v.string(), url: v.string() })),
  handler: async (ctx, args) => {
    void ctx;
    const { lookup } = await import("node:dns/promises");
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 256 * 1024);
    return await readPublicPage(args.url, limit, {
      resolve: async (host) => {
        const records = await lookup(host, { all: true, verbatim: true });
        return records.map((record) => record.address);
      },
      fetch: fetchPinned,
    });
  },
});
