import { test, expect } from "@playwright/test";

test("quote editor and preview use proposal wording and export a PDF", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "+ New quote", exact: true }).click();
  await page.getByLabel("Quote date", { exact: true }).fill("2026-09-19");
  await page.getByLabel("Valid until", { exact: true }).fill("2026-10-19");
  await page.getByLabel("Customer name", { exact: true }).fill("Quote test customer");
  await page.getByLabel("Quote terms", { exact: true }).fill("Please approve the proposed scope before scheduling.");
  await page.getByRole("button", { name: "Generate / issue quote", exact: true }).click();
  const paper = page.locator(".paper");
  await expect(paper).toContainText("Quote date: 2026-09-19");
  await expect(paper).toContainText("Valid until: 2026-10-19");
  await expect(paper).toContainText("Prepared for");
  await expect(paper).toContainText("Quoted total");
  await expect(paper).not.toContainText("Balance due");
  await expect(paper).not.toContainText("Payment methods");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  await page.reload();
  await page.getByLabel("Document type", { exact: true }).selectOption("Quote");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue("2026-10-19");
  await expect(page.getByLabel("Quote terms", { exact: true })).toHaveValue("Please approve the proposed scope before scheduling.");
});
