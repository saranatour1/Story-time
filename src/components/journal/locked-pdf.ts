const UNAMBIGUOUS_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const UNBIASED_BYTE_LIMIT = Math.floor(256 / UNAMBIGUOUS_CHARS.length) * UNAMBIGUOUS_CHARS.length;

export const newPassword = (): string => {
  const out: string[] = [];
  while (out.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < UNBIASED_BYTE_LIMIT && out.length < 16)
        out.push(UNAMBIGUOUS_CHARS[b % UNAMBIGUOUS_CHARS.length]!);
    }
  }
  return [0, 4, 8, 12].map((i) => out.slice(i, i + 4).join("")).join("-");
};

export const lockPdf = async (pdf: Blob | ArrayBuffer, password: string): Promise<Uint8Array> => {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(pdf instanceof Blob ? await pdf.arrayBuffer() : pdf);
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  doc.encrypt({
    userPassword: password,
    ownerPassword: owner,
    permissions: { printing: "highResolution", copying: true, contentAccessibility: true },
  });
  return doc.save();
};
