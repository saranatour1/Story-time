import { expect, test } from "vite-plus/test";
import { pngWithoutMeta, stripExif, webpWithoutMeta, withoutExif } from "./strip-exif";

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
  expect(withoutExif(photo().slice(0, 30))).toBeNull();
  expect(withoutExif(new Uint8Array([...SOI, ...APP0, ...EOI]))).toBeNull();
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

const be = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le = (n: number) => be(n).reverse();
const pngChunk = (type: string, data: number[]) => [
  ...be(data.length),
  ...text(type),
  ...data,
  9,
  9,
  9,
  9,
];

test("a PNG loses its EXIF and text chunks and keeps the rest byte for byte", () => {
  const sig = [0x89, ...text("PNG"), 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk(
    "IHDR",
    Array.from({ length: 13 }, () => 1),
  );
  const iccp = pngChunk("iCCP", [1, 2, 3]);
  const idat = pngChunk("IDAT", [4, 5, 6]);
  const iend = pngChunk("IEND", []);
  const png = new Uint8Array([
    ...sig,
    ...ihdr,
    ...iccp,
    ...pngChunk("eXIf", [0x4d, 0x4d, 0, 42]),
    ...pngChunk("iTXt", text("XML:com.adobe.xmp")),
    ...pngChunk("tEXt", text("GPS")),
    ...idat,
    ...iend,
  ]);
  expect(Array.from(pngWithoutMeta(png) ?? [])).toEqual([
    ...sig,
    ...ihdr,
    ...iccp,
    ...idat,
    ...iend,
  ]);
  expect(pngWithoutMeta(png.slice(0, 40))).toBeNull();
});

test("a WebP loses its EXIF and XMP chunks, their flags, and its size is fixed", async () => {
  const chunk = (type: string, data: number[]) => [
    ...text(type),
    ...le(data.length),
    ...data,
    ...(data.length % 2 ? [0] : []),
  ];
  const vp8x = (flags: number) => chunk("VP8X", [flags, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
  const image = chunk("VP8 ", [7, 7, 7]);
  const webp = (body: number[]) =>
    new Uint8Array([...text("RIFF"), ...le(4 + body.length), ...text("WEBP"), ...body]);
  const file = new File(
    [webp([...vp8x(0x2c), ...image, ...chunk("EXIF", [1, 2, 3, 4]), ...chunk("XMP ", [5])])],
    "a.webp",
    { type: "image/webp" },
  );
  const out = await stripExif(file);
  expect(out.type).toBe("image/webp");
  expect(Array.from(new Uint8Array(await out.arrayBuffer()))).toEqual(
    Array.from(webp([...vp8x(0x20), ...image])),
  );
  expect(webpWithoutMeta(new Uint8Array([...text("RIFF"), 0, 0, 0, 0]))).toBeNull();
});
