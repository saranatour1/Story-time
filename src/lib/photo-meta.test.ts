import { expect, test } from "vite-plus/test";
import { combinePhotoMeta, photoMetaFrom } from "./photo-meta";

const jpeg = ({
  zone,
  lngRef = "W",
  dateTag = 0x9003,
}: {
  zone?: string;
  lngRef?: string;
  dateTag?: number;
}): ArrayBuffer => {
  const tiff = new DataView(new ArrayBuffer(200));
  const u16 = (at: number, v: number) => tiff.setUint16(at, v, true);
  const u32 = (at: number, v: number) => tiff.setUint32(at, v, true);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => tiff.setUint8(at + i, c.charCodeAt(0)));
  const entry = (
    ifd: number,
    i: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    const e = ifd + 2 + i * 12;
    u16(e, tag);
    u16(e + 2, type);
    u32(e + 4, count);
    u32(e + 8, value);
  };

  u16(0, 0x4949);
  u16(2, 42);
  u32(4, 8);
  u16(8, 2);
  entry(8, 0, 0x8769, 4, 1, 140);
  entry(8, 1, 0x8825, 4, 1, 38);

  u16(38, 4);
  entry(38, 0, 1, 2, 2, "N".charCodeAt(0));
  entry(38, 1, 2, 5, 3, 92);
  entry(38, 2, 3, 2, 2, lngRef.charCodeAt(0) || 0);
  entry(38, 3, 4, 5, 3, 116);
  [38, 1, 41, 1, 516, 10, 9, 1, 12, 1, 576, 10].forEach((v, i) => u32(92 + i * 4, v));

  u16(140, zone ? 2 : 1);
  entry(140, 0, dateTag, 2, 20, 170);
  text(170, "2026:07:10 18:30:00\0");
  if (zone) {
    entry(140, 1, 0x9011, 2, 7, 190);
    text(190, `${zone}\0`);
  }

  const app1 = [..."Exif\0\0"].map((c) => c.charCodeAt(0)).concat(...new Uint8Array(tiff.buffer));
  const length = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xd9])
    .buffer;
};

test("reads where and when a JPEG was taken from its EXIF", () => {
  const meta = photoMetaFrom(jpeg({ zone: "+01:00" }));
  expect(meta.geo?.lat).toBeCloseTo(38.6977, 4);
  expect(meta.geo?.lng).toBeCloseTo(-9.216, 4);
  expect(meta.takenAt).toBe(Date.UTC(2026, 6, 10, 17, 30));
  expect(meta.offsetMinutes).toBe(60);
  expect(photoMetaFrom(jpeg({ zone: "-04:30" })).offsetMinutes).toBe(-270);

  expect(photoMetaFrom(jpeg({})).takenAt).toBe(new Date(2026, 6, 10, 18, 30).getTime());
  expect(photoMetaFrom(jpeg({})).offsetMinutes).toBeUndefined();

  expect(photoMetaFrom(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({});
  expect(photoMetaFrom(jpeg({}).slice(0, 40))).toEqual({});
});

const tiffOf = (jpegBytes: ArrayBuffer) => [...new Uint8Array(jpegBytes).slice(12, -2)];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => be32(n).reverse();

test("reads EXIF from a PNG's eXIf chunk and from a WebP's EXIF chunk at the end", () => {
  const tiff = tiffOf(jpeg({ zone: "+02:00" }));
  const chunk = (type: string, data: number[]) => [
    ...be32(data.length),
    ...ascii(type),
    ...data,
    0,
    0,
    0,
    0,
  ];
  const png = new Uint8Array([
    0x89,
    ...ascii("PNG\r\n\x1a\n"),
    ...chunk("IHDR", new Array(13).fill(0)),
    ...chunk("eXIf", tiff),
    ...chunk("IEND", []),
  ]).buffer;
  expect(photoMetaFrom(png).takenAt).toBe(Date.UTC(2026, 6, 10, 16, 30));

  const webp = new Uint8Array([
    ...ascii("RIFF"),
    ...le32(0),
    ...ascii("WEBPVP8 "),
    ...le32(4),
    1,
    2,
    3,
    4,
    ...ascii("EXIF"),
    ...le32(tiff.length + 6),
    ...ascii("Exif\0\0"),
    ...tiff,
  ]).buffer;
  expect(photoMetaFrom(webp).offsetMinutes).toBe(120);
});

test("without the taken date, the digitized date is used", () => {
  expect(photoMetaFrom(jpeg({ dateTag: 0x9004 })).takenAt).toBe(
    new Date(2026, 6, 10, 18, 30).getTime(),
  );
  expect(photoMetaFrom(jpeg({ dateTag: 0x9999 })).takenAt).toBeUndefined();
});

test("an empty E/W ref leaves the coordinate unsigned", () => {
  expect(photoMetaFrom(jpeg({ lngRef: "" })).geo?.lng).toBeCloseTo(9.216, 4);
});

test("several photos give the earliest time and the first place", () => {
  const lisbon = { lat: 38.7, lng: -9.1 };
  expect(
    combinePhotoMeta([
      {},
      { takenAt: 300 },
      { takenAt: 100, geo: lisbon },
      { geo: { lat: 1, lng: 2 } },
    ]),
  ).toEqual({ takenAt: 100, geo: lisbon });
  expect(combinePhotoMeta([{}, {}])).toEqual({ takenAt: undefined, geo: undefined });
});
