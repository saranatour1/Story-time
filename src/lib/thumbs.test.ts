import { expect, test } from "vitest";
import { displayThumbnail, thumbnail } from "./thumbs";

test("videos have no thumbnail", async () => {
  expect(await thumbnail(new File(["v"], "clip.mp4", { type: "video/mp4" }))).toBeUndefined();
  expect(await displayThumbnail(new File(["v"], "clip.mp4", { type: "video/mp4" }))).toBeUndefined();
});

test("a picture that can't be decoded has no thumbnail, and doesn't throw", async () => {
  expect(await thumbnail(new File(["not an image"], "photo.jpg", { type: "image/jpeg" }))).toBeUndefined();
});
