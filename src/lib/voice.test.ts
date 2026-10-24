import { describe, expect, test } from "vite-plus/test";
import { formatOfMime, micProblem } from "./voice";

describe("formatOfMime", () => {
  test("names what each browser records", () => {
    expect(formatOfMime("audio/webm;codecs=opus")).toBe("webm");
    expect(formatOfMime("audio/webm")).toBe("webm");
    expect(formatOfMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(formatOfMime("audio/mp4")).toBe("m4a");
    expect(formatOfMime("AUDIO/MP4;codecs=mp4a.40.2")).toBe("m4a");
  });

  test("a type the server can't read is undefined", () => {
    expect(formatOfMime("video/webm")).toBeUndefined();
    expect(formatOfMime("")).toBeUndefined();
  });
});

describe("micProblem", () => {
  test("says what to do when the microphone is blocked or missing", () => {
    expect(micProblem(new DOMException("denied", "NotAllowedError"))).toContain("blocked");
    expect(micProblem(new DOMException("none", "NotFoundError"))).toContain("No microphone");
    expect(micProblem(new Error("boom"))).toBe("I couldn't start the microphone.");
  });
});
