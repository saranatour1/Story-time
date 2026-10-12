import { expect, test } from "vitest";
import { photoMetaFromJpeg } from "./photo-meta";

// A minimal JPEG: SOI, then an Exif APP1 whose little-endian TIFF has IFD0
// pointing at a GPS IFD (Lisbon, 38°41'51.6"N 9°12'57.6"W) and an Exif IFD
// (taken 2026-07-10 18:30:00, optionally at +01:00). `lngRef` "" writes an
// empty E/W ref.
const jpeg = ({ zone, lngRef = "W" }: { zone?: string; lngRef?: string }): ArrayBuffer => {
  const tiff = new DataView(new ArrayBuffer(200));
  const u16 = (at: number, v: number) => tiff.setUint16(at, v, true);
  const u32 = (at: number, v: number) => tiff.setUint32(at, v, true);
  const text = (at: number, s: string) => [...s].forEach((c, i) => tiff.setUint8(at + i, c.charCodeAt(0)));
  // IFD entry `i` of the IFD at `ifd`: tag, type, count, value or offset.
  const entry = (ifd: number, i: number, tag: number, type: number, count: number, value: number) => {
    const e = ifd + 2 + i * 12;
    u16(e, tag);
    u16(e + 2, type);
    u32(e + 4, count);
    u32(e + 8, value);
  };

  u16(0, 0x4949); // "II"
  u16(2, 42);
  u32(4, 8); // IFD0 at 8
  u16(8, 2);
  entry(8, 0, 0x8769, 4, 1, 140); // Exif IFD at 140
  entry(8, 1, 0x8825, 4, 1, 38); // GPS IFD at 38

  u16(38, 4);
  entry(38, 0, 1, 2, 2, "N".charCodeAt(0)); // short ASCII sits inline
  entry(38, 1, 2, 5, 3, 92);
  entry(38, 2, 3, 2, 2, lngRef.charCodeAt(0) || 0);
  entry(38, 3, 4, 5, 3, 116);
  [38, 1, 41, 1, 516, 10, 9, 1, 12, 1, 576, 10].forEach((v, i) => u32(92 + i * 4, v));

  u16(140, zone ? 2 : 1);
  entry(140, 0, 0x9003, 2, 20, 170);
  text(170, "2026:07:10 18:30:00\0");
  if (zone) {
    entry(140, 1, 0x9011, 2, 7, 190);
    text(190, `${zone}\0`);
  }

  const app1 = [..."Exif\0\0"].map((c) => c.charCodeAt(0)).concat(...new Uint8Array(tiff.buffer));
  const length = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xd9]).buffer;
};

test("reads where and when a JPEG was taken from its EXIF", () => {
  const meta = photoMetaFromJpeg(jpeg({ zone: "+01:00" }));
  expect(meta.geo?.lat).toBeCloseTo(38.6977, 4);
  expect(meta.geo?.lng).toBeCloseTo(-9.216, 4); // west is negative
  expect(meta.takenAt).toBe(Date.UTC(2026, 6, 10, 17, 30));
  expect(meta.offsetMinutes).toBe(60);
  expect(photoMetaFromJpeg(jpeg({ zone: "-04:30" })).offsetMinutes).toBe(-270);

  // Without a recorded zone, the time is the browser's local time.
  expect(photoMetaFromJpeg(jpeg({})).takenAt).toBe(new Date(2026, 6, 10, 18, 30).getTime());
  expect(photoMetaFromJpeg(jpeg({})).offsetMinutes).toBeUndefined();

  // Not a JPEG, or cut short: nothing rather than an error.
  expect(photoMetaFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({});
  expect(photoMetaFromJpeg(jpeg({}).slice(0, 40))).toEqual({});
});

test("an empty E/W ref leaves the coordinate unsigned", () => {
  expect(photoMetaFromJpeg(jpeg({ lngRef: "" })).geo?.lng).toBeCloseTo(9.216, 4);
});
