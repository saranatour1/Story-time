// The journal as a PDF that opens only with a password: the PDF standard's
// own AES-256 encryption (revision 6), so any reader (Preview, Acrobat, a
// phone) asks for the password and nothing else is needed to open it.

// Letters and digits that can't be mistaken for each other read aloud or
// handwritten: no i, l, o, 0 or 1.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// Four groups of four, about 79 bits: "kq7m-3vtx-p9ra-w2hc".
export const newPassword = (): string => {
  const out: string[] = [];
  while (out.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      // Rejection sampling, so every character is equally likely.
      if (b < ALPHABET.length * 8 && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return [0, 4, 8, 12].map((i) => out.slice(i, i + 4).join("")).join("-");
};

// Encrypts a finished PDF. The owner password, which would lift the
// restrictions, is random and kept nowhere: readers can print and copy, and
// nobody can strip the lock.
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
