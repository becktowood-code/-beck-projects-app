import { test, expect } from "@playwright/test";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import fs from "node:fs/promises";

for (const type of ["invoice", "quote"])
  test(`${type} itemizes multiple material sources in preview, saved record and PDF`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5174");
    await page
      .getByRole("button", { name: `+ New ${type}`, exact: true })
      .click();
    await page
      .getByLabel("Customer name", { exact: true })
      .fill("Billing test");
    await page.getByLabel("Labor 1 Description").fill("Install outlets");
    await page
      .getByRole("button", { name: "+ Add labor", exact: true })
      .click();
    await page.getByLabel("Labor 2 Description").fill("Inspect panel");
    await page.getByLabel("Labor 2 Rate ($)", { exact: true }).fill("50");
    for (const [i, description, source, cost] of [
      [1, "Wire", "Supplier A", "20"],
      [2, "Breaker", "Supplier B", "30"],
    ]) {
      await page
        .getByRole("button", { name: "+ Add materials", exact: true })
        .click();
      await page.getByLabel(`Materials ${i} Description`).fill(description);
      await page.getByLabel(`Materials ${i} Source / supplier`).fill(source);
      await page
        .getByLabel(`Materials ${i} Unit cost ($)`, { exact: true })
        .fill(cost);
    }
    const receipt = await PDFDocument.create();
    receipt.addPage().drawText("Supplier receipt");
    await page.getByLabel("Upload receipts / material lists").setInputFiles([
      {
        name: "receipt-a.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await receipt.save()),
      },
      {
        name: "receipt-b.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await receipt.save()),
      },
    ]);
    await page
      .getByLabel("Material description", { exact: true })
      .nth(0)
      .fill("Conduit");
    await page
      .getByLabel("Material source / supplier", { exact: true })
      .nth(0)
      .fill("Supplier C");
    await page
      .getByLabel("Receipt amount ($)", { exact: true })
      .nth(0)
      .fill("107");
    await page
      .getByLabel("Material description", { exact: true })
      .nth(1)
      .fill("Boxes");
    await page
      .getByLabel("Receipt amount ($)", { exact: true })
      .nth(1)
      .fill("20");
    await page.getByLabel("Tax included in receipt total").nth(1).uncheck();
    const preview = page.locator(".paper");
    await expect(
      preview.getByRole("row").filter({ hasText: "Labor Total" }),
    ).toContainText("$214.00");
    await expect(
      preview.getByRole("row").filter({ hasText: "Materials Total" }),
    ).toContainText("$181.90");
    await expect(preview.locator(".grand")).toContainText("$395.90");
    const text = await preview.innerText();
    expect(text.indexOf("Labor Total")).toBeLessThan(text.indexOf("Materials"));
    await page
      .getByRole("button", { name: `Generate / issue ${type}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /HA-0001 Issued/ }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByLabel("Document type", { exact: true })
      .selectOption(type === "quote" ? "Quote" : "Invoice");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(
      page.getByLabel("Material description", { exact: true }).nth(0),
    ).toHaveValue("Conduit");
    await expect(page.getByLabel("Materials 2 Source / supplier")).toHaveValue(
      "Supplier B",
    );
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    const download = await pending;
    const path = `artifacts/billing-${type}.pdf`;
    await download.saveAs(path);
    const pdf = await PDFDocument.load(await fs.readFile(path));
    const extracted = pdf.context
      .enumerateIndirectObjects()
      .flatMap(([, obj]) => {
        if (!(obj instanceof PDFRawStream)) return [];
        try {
          return [
            ...Buffer.from(decodePDFRawStream(obj).decode())
              .toString("latin1")
              .matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g),
          ].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
        } catch {
          return [];
        }
      })
      .join("\n");
    for (const label of [
      "Install outlets",
      "Inspect panel",
      "Supplier A",
      "Supplier B",
      "Conduit",
      "Boxes",
      "Labor Total: $214.00",
      "Materials Total: $181.90",
      "Total: $395.90",
    ])
      expect(extracted).toContain(label);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/billing-${type}-mobile.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
