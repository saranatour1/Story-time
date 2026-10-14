import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { lockPdf, newPassword } from "./locked-pdf";

describe("a locked PDF", () => {
  test("opens only with its password, and is AES-256", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    doc.addPage([595, 842]);
    const locked = await lockPdf((await doc.save()).slice().buffer, "kq7m-3vtx-p9ra-w2hc");
    const text = new TextDecoder("latin1").decode(locked);
    expect(text).toMatch(/\/Encrypt/);
    expect(text).toMatch(/\/V 5/);
    expect(text).toMatch(/\/R 6/);
    await expect(PDFDocument.load(locked)).rejects.toThrow();
    await expect(PDFDocument.load(locked, { password: "wrong password" })).rejects.toThrow();
    expect(
      (await PDFDocument.load(locked, { password: "kq7m-3vtx-p9ra-w2hc" })).getPageCount(),
    ).toBe(2);
  });

  test("passwords are four groups of four, easy to read out, and different each time", () => {
    const made = new Set(Array.from({ length: 50 }, newPassword));
    expect(made.size).toBe(50);
    for (const password of made)
      expect(password).toMatch(/^[a-hj-km-np-z2-9]{4}(-[a-hj-km-np-z2-9]{4}){3}$/);
  });
});
