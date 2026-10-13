import test from "node:test";
import assert from "node:assert/strict";
import { blankDocument, COMPANY } from "../src/domain/invoice.js";
import { paymentInstructions, hasZelleQr } from "../src/domain/payment.js";
import { invoiceEmail } from "../src/domain/email.js";

test("new and existing invoices use the new Zelle destination without changing contact details", () => {
  const d = blankDocument("HA-TEST");
  assert.match(d.company.payment, /Zelle: paybeckprojects/);
  d.company.payment = COMPANY.payment.replace("paybeckprojects", "high-amps@outlook.com");
  const before = structuredClone(d);
  assert.match(paymentInstructions(d.company), /Zelle: paybeckprojects/);
  assert.doesNotMatch(paymentInstructions(d.company), /Bank transfer|routing information/);
  assert.ok(hasZelleQr(d.company));
  assert.match(invoiceEmail(d).body, /Zelle: paybeckprojects/);
  assert.doesNotMatch(invoiceEmail(d).body, /Zelle: high-amps@outlook.com/);
  assert.equal(d.company.email, "high-amps@outlook.com");
  assert.deepEqual(d, before);
  assert.equal(paymentInstructions({ payment: "Wire transfer only" }), "Zelle: paybeckprojects");
  assert.equal(hasZelleQr({ payment: "Zelle: someone-else" }), true);
});
