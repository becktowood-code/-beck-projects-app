import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("legacy invoice preview and PDF include current Zelle tag and the original QR", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.evaluate(async () => {
    const { repository } = await import('/src/storage/repository.js');
    let doc = await repository.create();
    doc.customerName = "Payment layout test";
    doc.company.payment = doc.company.payment.replace('paybeckprojects', 'high-amps@outlook.com');
    await repository.save(doc, { action: 'issue' });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.payment-methods')).toContainText('Zelle: paybeckprojects');
  await expect(page.locator('.payment-methods')).not.toContainText('Bank transfer');
  await expect(page.getByRole('img', { name: 'Zelle QR code for Beck Projects LLC, paybeckprojects' })).toBeVisible();
  await fs.mkdir('artifacts', { recursive: true });
  for (const [button, file] of [['Download PDF', 'payment-invoice.pdf'], ['Download smaller PDF', 'payment-invoice-smaller.pdf']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    await (await download).saveAs(`artifacts/${file}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.payment-methods').screenshot({ path: 'artifacts/payment-mobile.png' });
  await page.getByRole('button', { name: '+ New quote', exact: true }).click();
  await expect(page.locator('.payment-methods')).toHaveCount(0);
});
