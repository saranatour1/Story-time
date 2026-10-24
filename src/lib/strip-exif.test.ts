import { expect, test } from "vite-plus/test";
import { stripExif, withoutExif } from "./strip-exif";

// A segment: its marker, a two-byte length that counts itself, then the body.
const segment = (marker: number, body: number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

const SOI = [0xff, 0xd8];
const APP0 = segment(0xe0, [...text("JFIF\0"), 1, 1]);
// Where and when the photo was taken would be in here.
const APP1 = segment(0xe1, [...text("Exif\0\0"), 0x49, 0x49, 42, 0, 8, 0, 0, 0]);
const APP2 = segment(0xe2, [...text("ICC_PROFILE\0"), 1, 1, 0]);
const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0]);
const DATA = [0x12, 0x34, 0x56];
const EOI = [0xff, 0xd9];

const photo = () =>
  new Uint8Array([...SOI, ...APP0, ...APP1, ...DQT, ...APP2, ...SOS, ...DATA, ...EOI]);

test("drops the Exif and ICC segments and keeps everything else byte for byte", () => {
  expect(Array.from(withoutExif(photo()) ?? [])).toEqual([
    ...SOI,
    ...APP0,
    ...DQT,
    ...SOS,
    ...DATA,
    ...EOI,
  ]);
});

test("anything that isn't a clean JPEG is left alone", () => {
  expect(withoutExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBeNull();
  expect(withoutExif(photo().slice(0, 30))).toBeNull(); // cut off inside APP1
  expect(withoutExif(new Uint8Array([...SOI, ...APP0, ...EOI]))).toBeNull(); // no image data
});

test("stripExif gives a JPEG back without its Exif, as a JPEG", async () => {
  const kept = [...SOI, ...APP0, ...DQT, ...SOS, ...DATA, ...EOI];
  const out = await stripExif(new File([photo()], "trip.jpg", { type: "image/jpeg" }));
  expect(out.type).toBe("image/jpeg");
  expect(out.size).toBe(kept.length);
  expect(Array.from(new Uint8Array(await out.arrayBuffer()))).toEqual(kept);
});

test("other types, and JPEGs that don't parse, come back as the same file", async () => {
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", { type: "image/png" });
  expect(await stripExif(png)).toBe(png);
  const broken = new File([photo().slice(0, 30)], "cut.jpg", { type: "image/jpeg" });
  expect(await stripExif(broken)).toBe(broken);
});
