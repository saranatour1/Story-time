import { describe, expect, test } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { blocksForShelf } from "./command-shelf";

const id = (n: string) => n as Id<"media">;

describe("blocksForShelf", () => {
  test("photos and a video become blocks, and the words become the note", () => {
    expect(
      blocksForShelf(
        [
          { mediaId: id("pic"), mime: "image/jpeg" },
          { mediaId: id("clip"), mime: "video/mp4" },
        ],
        "  the tram  ",
      ),
    ).toEqual([
      { type: "photo", mediaId: "pic" },
      { type: "video", mediaId: "clip" },
      { type: "note", text: "the tram" },
    ]);
  });

  test("no words means no note block", () => {
    expect(blocksForShelf([{ mediaId: id("pic"), mime: "image/png" }], "   ")).toEqual([
      { type: "photo", mediaId: "pic" },
    ]);
  });
});
