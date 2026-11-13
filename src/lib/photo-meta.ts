export type PhotoMeta = {
  geo?: { lat: number; lng: number };
  takenAt?: number;
  offsetMinutes?: number;
};

const HEAD_BYTES = 128 * 1024;
const INTEL_BYTE_ORDER_II = 0x4949;
const EXIF_IN_ASCII = 0x45786966;

const noGpsFix = (lat: number, lng: number): boolean => lat === 0 && lng === 0;

export const readPhotoMeta = async (file: File): Promise<PhotoMeta> => {
  if (file.type !== "image/jpeg") return {};
  return photoMetaFromJpeg(await file.slice(0, HEAD_BYTES).arrayBuffer());
};

export const combinePhotoMeta = (metas: PhotoMeta[]): Pick<PhotoMeta, "geo" | "takenAt"> => {
  const times = metas.flatMap((m) => (m.takenAt === undefined ? [] : [m.takenAt]));
  return {
    takenAt: times.length > 0 ? Math.min(...times) : undefined,
    geo: metas.find((m) => m.geo)?.geo,
  };
};

export const photoMetaFromJpeg = (buffer: ArrayBuffer): PhotoMeta => {
  const view = new DataView(buffer);
  const tiff = attempt(() => exifStart(view));
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
    if (!pointer) return undefined;
    const exif = ifd(u32(pointer.at));
    const original = exif.get(0x9003);
    if (!original) return undefined;
    const offset = exif.get(0x9011);
    return parseExifTime(ascii(original), offset && ascii(offset));
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

const exifStart = (view: DataView): number | undefined => {
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
