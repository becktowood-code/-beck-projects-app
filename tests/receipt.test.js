import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { blankDocument, transition, calculate } from "../src/domain/invoice.js";
import { createReceiptPdf } from "../src/services/receipt.js";

test("a receipt is only created for a paid invoice", async () => {
  const draft = blankDocument("HA-1234");
  await assert.rejects(createReceiptPdf(draft), /only for paid invoices/);
  const quote = blankDocument("HA-1235", "Quote");
  await assert.rejects(createReceiptPdf(quote), /only for paid invoices/);
});

test("a paid invoice produces a readable, standalone receipt PDF", async () => {
  const draft = blankDocument("HA-1236");
  draft.customerName = "Test Customer";
  draft.labor = [{ id: "a", description: "Installation", hours: 2, rate: 100 }];
  const issued = transition(draft, "issue");
  const paid = transition(issued, "paid", {
    paidDate: "2026-11-01",
    paymentMethod: "Zelle",
    paymentReference: "TEST-123",
  });
  assert.equal(calculate(paid).balance, 0);
  const receipt = await createReceiptPdf(paid);
  assert.equal(receipt.type, "application/pdf");
  const pdf = await PDFDocument.load(await receipt.arrayBuffer());
  assert.ok(pdf.getPageCount() >= 1);
  assert.equal(pdf.getTitle(), "Payment receipt HA-1236-R1");
  assert.ok(receipt.size > 1000);
});
