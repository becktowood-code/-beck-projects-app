import { test, expect } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";
import fs from "node:fs/promises";

test("invoice lifecycle persists attachments, exports complete PDF, and locks paid records", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByRole("button", { name: "+ New invoice", exact: true })
    .click();
  await page
    .getByLabel("Customer name", { exact: true })
    .fill("Riverside Homeowner");
  await page
    .getByLabel("Customer email", { exact: true })
    .fill("client@example.com");
  await page
    .getByLabel("Contractor name", { exact: true })
    .fill("Boca General Contractor");
  await page
    .getByLabel("Contractor email", { exact: true })
    .fill("contractor@example.com");
  await page.getByLabel("Bill to", { exact: true }).selectOption("contractor");
  await page.getByLabel("Project / job title").fill("Panel replacement");
  await page.getByLabel("Labor 1 Hours").fill("3");
  await page
    .getByRole("button", { name: "+ Add materials", exact: true })
    .click();
  await page.getByLabel("Materials 1 Description").fill("Breaker panel");
  await page
    .getByLabel("Materials 1 Unit cost ($)", { exact: true })
    .fill("100");
  await page.getByLabel("Materials 1 Markup (%)", { exact: true }).fill("20");
  const source = await PDFDocument.create();
  for (const [w, h] of [
    [1600, 300],
    [300, 2400],
  ]) {
    const p = source.addPage([w, h]);
    p.drawRectangle({
      x: 1,
      y: 1,
      width: w - 2,
      height: h - 2,
      borderColor: rgb(1, 0, 0),
      borderWidth: 2,
    });
    p.drawText("TOP EDGE", { x: 10, y: h - 24, size: 18 });
    p.drawText("BOTTOM EDGE", { x: 10, y: 10, size: 18 });
  }
  await page
    .getByLabel("Upload receipts / material lists")
    .setInputFiles({
      name: "Two-page-material-list.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await source.save()),
    });
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 3000;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 300, 3000);
    ctx.strokeStyle = "red";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 290, 2990);
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("TOP OF RECEIPT", 15, 35);
    ctx.fillText("BOTTOM OF RECEIPT", 15, 2970);
    return c.toDataURL().split(",")[1];
  });
  await page
    .getByLabel("Upload job photos")
    .setInputFiles({
      name: "Tall-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await page
    .getByRole("button", { name: "Generate / issue invoice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "HA-0001 Issued", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByText("Tall-receipt.png", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Corrected after generation. Thank you.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Record saved.");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloading;
  await download.saveAs("artifacts/invoice-with-attachments.pdf");
  const pdf = await PDFDocument.load(
    await fs.readFile("artifacts/invoice-with-attachments.pdf"),
  );
  expect(pdf.getPageCount()).toBe(4);
  for (const p of pdf.getPages())
    expect(p.getSize()).toEqual({ width: 612, height: 792 });
  await page.screenshot({
    path: "artifacts/invoice-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reopen as draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "HA-0001 Draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate / issue invoice", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await page
    .getByLabel("Payment reference / note")
    .fill("Zelle confirmation 123");
  await page
    .getByRole("button", { name: "Confirm paid & lock", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "HA-0001 Paid", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Customer name", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Upload receipts / material lists"),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reopen as draft", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Corrected after generation. Thank you.",
  );
  await expect(page.getByLabel("Notes", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Invoice records", exact: true })
    .click();
  await page.getByLabel("Search records").fill("Boca");
  await page.getByLabel("Status", { exact: true }).selectOption("Paid");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".records-table")).toContainText("$609.90");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/records-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Backup & storage", exact: true })
    .click();
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const backup = await backupDownload;
  await backup.saveAs("artifacts/backup.json");
  const data = JSON.parse(await fs.readFile("artifacts/backup.json", "utf8"));
  expect(data.documents[0].status).toBe("Paid");
  expect(data.attachments).toHaveLength(2);
  expect(data.revisions.length).toBeGreaterThan(3);
  const restoredContext = await browser.newContext();
  const restored = await restoredContext.newPage();
  await restored.goto("http://127.0.0.1:5174");
  await restored
    .getByRole("button", { name: "Backup & storage", exact: true })
    .click();
  await restored
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles("artifacts/backup.json");
  await expect(restored.getByRole("status")).toContainText(
    "Restored 1 records",
  );
  await restored
    .getByRole("button", { name: "Invoice records", exact: true })
    .click();
  await restored.getByRole("button", { name: "Open", exact: true }).click();
  await expect(restored.getByLabel("Notes", { exact: true })).toBeDisabled();
  await restoredContext.close();
  expect(errors).toEqual([]);
});
