import { test, expect } from "@playwright/test";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import fs from "node:fs/promises";

test("smaller download compresses scanned PDF attachments while preserving text and dimensions", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1600;
    const ctx = c.getContext("2d");
    const p = ctx.createImageData(c.width, c.height);
    let seed = 7;
    for (let i = 0; i < p.data.length; i += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const v = 230 + (seed >>> 28);
      p.data[i] = v;
      p.data[i + 1] = v;
      p.data[i + 2] = v;
      p.data[i + 3] = 255;
    }
    ctx.putImageData(p, 0, 0);
    ctx.fillStyle = "black";
    ctx.font = "32px Arial";
    ctx.fillText("Receipt - Electrical supplies $137.98", 50, 150);
    return c.toDataURL().split(",")[1];
  });
  const source = await PDFDocument.create();
  const image = await source.embedPng(Buffer.from(png, "base64"));
  const p = source.addPage();
  p.drawImage(image, { x: 40, y: 80, width: 500, height: 650 });
  p.drawText("Original receipt text", { x: 40, y: 750 });
  await page
    .getByRole("button", { name: "+ New invoice", exact: true })
    .click();
  await page
    .getByLabel("Upload receipts / material lists")
    .setInputFiles({
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await source.save()),
    });
  await expect(
    page.getByText("scan.pdf", { exact: true }).first(),
  ).toBeVisible();
  const download = async (name, path) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const d = await pending;
    await d.saveAs(path);
    return d;
  };
  await download("Download PDF", "artifacts/scan-regular.pdf");
  const smaller = await download(
    "Download smaller PDF",
    "artifacts/scan-smaller.pdf",
  );
  expect(smaller.suggestedFilename()).toBe("HA-0001-smaller.pdf");
  const before = await fs.readFile("artifacts/scan-regular.pdf"),
    after = await fs.readFile("artifacts/scan-smaller.pdf");
  expect(after.length).toBeLessThan(before.length * 0.7);
  const pdf = await PDFDocument.load(after);
  expect(pdf.getPageCount()).toBe(2);
  const jpgs = pdf.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter(
      (o) =>
        o instanceof PDFRawStream &&
        o.dict.get(PDFName.of("Filter"))?.toString() === "/DCTDecode",
    );
  expect(jpgs).toHaveLength(1);
  expect(jpgs[0].dict.get(PDFName.of("Width")).toString()).toBe("1200");
  expect(jpgs[0].dict.get(PDFName.of("Height")).toString()).toBe("1600");
  // A subsequent standard download still uses the unchanged saved attachment.
  await download("Download PDF", "artifacts/scan-regular-again.pdf");
  expect((await fs.stat("artifacts/scan-regular-again.pdf")).size).toBe(
    before.length,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
