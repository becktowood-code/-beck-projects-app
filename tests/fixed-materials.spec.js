import { test, expect } from "@playwright/test";

test("fixed cost materials inclusion persists without changing the total", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "+ New quote", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("Fixed cost test");
  await page.getByRole("button", { name: "Remove labor 1", exact: true }).click();
  await page.getByLabel("Apply sales tax", { exact: true }).uncheck();
  await page.getByRole("button", { name: "+ Add fixed costs", exact: true }).click();
  await page.getByLabel("Fixed costs 1 Description", { exact: true }).fill("Bathroom refresh");
  await page.getByLabel("Fixed costs 1 Amount ($)", { exact: true }).fill("15000");
  const checkbox = page.getByLabel("Fixed costs 1 Includes materials", { exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(page.locator("small").filter({ hasText: "Includes materials" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Unsaved changes — save before leaving", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Invoice records", exact: true }).click();
  await page.getByLabel("Document type", { exact: true }).selectOption("Quote");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await expect(page.locator(".grand").filter({ hasText: "$15,000.00" })).toBeVisible();
  await checkbox.uncheck();
  await expect(page.locator("small").filter({ hasText: "Includes materials" })).not.toBeVisible();
  await expect(page.locator(".grand").filter({ hasText: "$15,000.00" })).toBeVisible();
});

