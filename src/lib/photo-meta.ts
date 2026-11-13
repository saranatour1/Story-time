export type PhotoMeta = {
  geo?: { lat: number; lng: number };
  takenAt?: number;
  offsetMinutes?: number;
};

const EDGE_BYTES = 128 * 1024;
const INTEL_BYTE_ORDER_II = 0x4949;
const EXIF_IN_ASCII = 0x45786966;
const PNG_SIGNATURE = 0x89504e47;
const PNG_EXIF_CHUNK = 0x65584966; // "eXIf"
const PNG_END_CHUNK = 0x49454e44; // "IEND"
const WEBP_EXIF_CHUNK = 0x45584946; // "EXIF"
const DATE_TAGS = [0x9003, 0x9004] as const; // taken, then digitized
const OFFSET_OF = { 0x9003: 0x9011, 0x9004: 0x9012 } as const;
const IFD0_DATE = 0x0132;
const OFFSET_TIME = 0x9010;

const noGpsFix = (lat: number, lng: number): boolean => lat === 0 && lng === 0;

// JPEG and PNG keep EXIF near the start; WebP often keeps it at the end.
export const readPhotoMeta = async (file: File): Promise<PhotoMeta> => {
  if (!file.type.startsWith("image/")) return {};
  const head = photoMetaFrom(await file.slice(0, EDGE_BYTES).arrayBuffer());
  if (head.takenAt !== undefined || file.size <= EDGE_BYTES) return head;
  return { ...photoMetaFrom(await file.slice(-EDGE_BYTES).arrayBuffer()), ...head };
};

export const combinePhotoMeta = (metas: PhotoMeta[]): Pick<PhotoMeta, "geo" | "takenAt"> => {
  const times = metas.flatMap((m) => (m.takenAt === undefined ? [] : [m.takenAt]));
  return {
    takenAt: times.length > 0 ? Math.min(...times) : undefined,
    geo: metas.find((m) => m.geo)?.geo,
  };
};

export const photoMetaFrom = (buffer: ArrayBuffer): PhotoMeta => {
  const view = new DataView(buffer);
  const tiff = attempt(() => jpegExif(view) ?? pngExif(view) ?? chunkExif(view));
  const little = attempt(() => tiff !== undefined && view.getUint16(tiff) === INTEL_BYTE_ORDER_II);
  if (tiff === undefined || little === undefined) return {};
  const u16 = (o: number) => view.getUint16(tiff + o, little);
  const u32 = (o: number) => view.getUint32(tiff + o, little);
  // Tag → { count, at }: `at` is the entry's value field, which holds the
  // value itself when it fits in 4 bytes, else the offset to it.
  const ifd = (offset: number) =>
    new Map(
      Array.from({ length: u16(offset) }, (_, i) => {
        const e = offset + 2 + i * 12;
        return [u16(e), { count: u32(e + 4), at: e + 8 }] as const;
      }),
    );
  const ascii = ({ count, at }: { count: number; at: number }) => {
    const start = tiff + (count <= 4 ? at : u32(at));
    const bytes = new Uint8Array(view.buffer, view.byteOffset + start, Math.min(count, 64));
    return String.fromCharCode(...bytes).replace(/\0.*$/, "");
  };

  const ifd0 = attempt(() => ifd(u32(4)));
  const geo = attempt(() => {
    const pointer = ifd0?.get(0x8825);
    if (!pointer) return undefined;
    const gps = ifd(u32(pointer.at));
    const coordinate = (refTag: number, valueTag: number) => {
      const ref = gps.get(refTag);
      const value = gps.get(valueTag);
      if (!ref || !value) return NaN;
      const data = u32(value.at);
      const part = (i: number) => u32(data + i * 8) / u32(data + i * 8 + 4);
      const sign = ["S", "W"].includes(ascii(ref)) ? -1 : 1;
      return sign * (part(0) + part(1) / 60 + part(2) / 3600);
    };
    const lat = coordinate(1, 2);
    const lng = coordinate(3, 4);
    const onMap =
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return onMap && !noGpsFix(lat, lng) ? { lat, lng } : undefined;
  });
  const time = attempt(() => {
    const pointer = ifd0?.get(0x8769);
    const exif: ReturnType<typeof ifd> = pointer ? ifd(u32(pointer.at)) : new Map();
    for (const tag of DATE_TAGS) {
      const date = exif.get(tag);
      const offset = exif.get(OFFSET_OF[tag]) ?? exif.get(OFFSET_TIME);
      const read = date && parseExifTime(ascii(date), offset && ascii(offset));
      if (read) return read;
    }
    const saved = ifd0?.get(IFD0_DATE);
    const offset = exif.get(OFFSET_TIME);
    return saved && parseExifTime(ascii(saved), offset && ascii(offset));
  });

  const meta: PhotoMeta = { ...time };
  if (geo) meta.geo = geo;
  return meta;
};

const parseExifTime = (
  text: string,
  offset: string | undefined,
): Pick<PhotoMeta, "takenAt" | "offsetMinutes"> | undefined => {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return undefined;
  const [y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || d < 1) return undefined;
  const zone = offset ? /^([+-])(\d{2}):(\d{2})$/.exec(offset) : null;
  if (zone) {
    const offsetMinutes = (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3]));
    return { takenAt: Date.UTC(y, mo - 1, d, h, mi, s) - offsetMinutes * 60_000, offsetMinutes };
  }
  return { takenAt: new Date(y, mo - 1, d, h, mi, s).getTime() };
};

const pngExif = (view: DataView): number | undefined => {
  if (view.getUint32(0) !== PNG_SIGNATURE) return undefined;
  let at = 8;
  while (at + 8 <= view.byteLength) {
    const type = view.getUint32(at + 4);
    if (type === PNG_EXIF_CHUNK) return at + 8;
    if (type === PNG_END_CHUNK) return undefined;
    at += 12 + view.getUint32(at);
  }
  return undefined;
};

// A WebP "EXIF" chunk, wherever it is in these bytes. Some writers put
// "Exif\0\0" before the TIFF header, as JPEG does.
const chunkExif = (view: DataView): number | undefined => {
  for (let at = 0; at + 12 <= view.byteLength; at++) {
    if (view.getUint32(at) !== WEBP_EXIF_CHUNK) continue;
    const data = at + 8;
    return view.getUint32(data) === EXIF_IN_ASCII ? data + 6 : data;
  }
  return undefined;
};

const jpegExif = (view: DataView): number | undefined => {
  if (view.getUint16(0) !== 0xffd8) return undefined;
  let at = 2;
  while (at + 4 <= view.byteLength) {
    const marker = view.getUint16(at);
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return undefined;
    if (marker === 0xffe1 && view.getUint32(at + 4) === EXIF_IN_ASCII) return at + 10;
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
};

const attempt = <T>(read: () => T | undefined): T | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};
