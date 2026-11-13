import { describe, expect, test } from "vite-plus/test";
import { looksLike, peek } from "./sniff";

const of = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe("upload signatures", () => {
  test("a file passes only as the type its first bytes say", () => {
    expect(looksLike(of([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(looksLike(of([0x89], "PNG\r\n", [0x1a], "\n"), "image/png")).toBe(true);
    expect(looksLike(of("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp")).toBe(true);
    expect(looksLike(of([0, 0, 0, 0x1c], "ftypavif"), "image/avif")).toBe(true);
    expect(looksLike(of([0, 0, 0, 0x18], "ftypisom"), "video/mp4")).toBe(true);

    // A Windows program, a script and a page, each named a photo.
    expect(looksLike(of("MZ", [0x90, 0]), "image/jpeg")).toBe(false);
    expect(looksLike(of("#!/bin/sh\n"), "image/png")).toBe(false);
    expect(looksLike(of("<html><script>"), "image/gif")).toBe(false);
    // The right bytes under the wrong name, a short file, an unknown type.
    expect(looksLike(of([0xff, 0xd8, 0xff]), "image/png")).toBe(false);
    expect(looksLike(of([0xff]), "image/jpeg")).toBe(false);
    expect(looksLike(of([0xff, 0xd8, 0xff]), "application/zip")).toBe(false);
  });

  test("peeking keeps every byte, however the upload is cut up", async () => {
    const all = of("GIF89a and then the rest of the file");
    const cuts = [all.subarray(0, 3), all.subarray(3, 20), all.subarray(20)];
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const cut of cuts) controller.enqueue(cut);
        controller.close();
      },
    });
    const { head, body } = await peek(source);
    expect(looksLike(head, "image/gif")).toBe(true);
    expect(head).toHaveLength(16);
    expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(all);
  });
});
