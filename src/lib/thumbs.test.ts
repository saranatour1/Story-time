import { expect, test } from "vite-plus/test";
import { displayThumbnail } from "./thumbs";

test("videos have no thumbnail", async () => {
  expect(
    await displayThumbnail(new File(["v"], "clip.mp4", { type: "video/mp4" })),
  ).toBeUndefined();
});

test("a picture that can't be decoded has no thumbnail, and doesn't throw", async () => {
  expect(
    await displayThumbnail(new File(["not an image"], "photo.jpg", { type: "image/jpeg" })),
  ).toBeUndefined();
});
