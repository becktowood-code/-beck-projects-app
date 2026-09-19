import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDocument,
  billingBreakdown,
  calculate,
} from "../src/domain/invoice.js";

for (const type of ["Invoice", "Quote"])
  for (const recipient of ["customer", "contractor"])
    for (const applyTax of [true, false]) {
      test(`${type}: itemized totals, ${recipient}, tax ${applyTax}`, () => {
        const d = {
          ...blankDocument("HA-TEST", type),
          recipient,
          applyTax,
          labor: [
            { description: "Install", hours: 2, rate: 100 },
            { description: "Inspect", hours: 1, rate: 50 },
          ],
          fixedItems: [{ description: "Service call", amount: 25 }],
          materials: [
            {
              description: "Wire",
              source: "Supplier A",
              qty: 2,
              cost: 10,
              markup: 10,
            },
            {
              description: "Breaker",
              source: "Supplier B",
              qty: 1,
              cost: 30,
              markup: 0,
            },
          ],
          attachments: [
            {
              name: "a.pdf",
              description: "Conduit",
              source: "Supplier C",
              category: "Receipt / material list",
              invoiceAmount: 107,
              taxIncluded: true,
            },
            {
              name: "b.pdf",
              description: "Boxes",
              category: "Receipt / material list",
              invoiceAmount: 20,
              taxIncluded: false,
            },
            { name: "photo.png", category: "Photo", invoiceAmount: 999 },
          ],
        };
        const b = billingBreakdown(d),
          t = calculate(d);
        assert.equal(b.labor.length, 3);
        assert.equal(b.materials.length, 4);
        assert.equal(b.materials[2].description, "Conduit");
        assert.equal(b.materials[0].source, "Supplier A");
        assert.equal(
          b.laborTotal,
          applyTax ? (recipient === "customer" ? 29425 : 27675) : 27500,
        );
        assert.equal(b.materialsTotal, applyTax ? 18404 : 17900);
        assert.equal(
          Math.round(t.total * 100),
          b.laborTotal + b.materialsTotal,
        );
        assert.equal(
          Math.round((t.subtotal + t.tax) * 100),
          Math.round(t.total * 100),
        );
      });
    }
test("legacy receipts retain existing tax treatment and filename", () => {
  const d = {
    ...blankDocument("HA-OLD"),
    labor: [],
    attachments: [
      {
        name: "old.pdf",
        category: "Receipt / material list",
        invoiceAmount: 107,
      },
    ],
  };
  const b = billingBreakdown(d);
  assert.equal(b.materialsTotal, 11449);
  assert.equal(b.materialsTax, 749);
  assert.equal(b.materials[0].description, "old.pdf");
});
test("fractional lines and receipt tax rounding reconcile exactly", () => {
  const d = {
    ...blankDocument("HA-ROUND"),
    labor: [{ hours: 0.333, rate: 99.99 }],
    materials: [{ qty: 3, cost: 1.15, markup: 20 }],
    attachments: [
      {
        category: "Receipt / material list",
        invoiceAmount: 0.05,
        taxIncluded: true,
      },
    ],
  };
  const b = billingBreakdown(d);
  assert.equal(b.laborTotal, 3563);
  assert.equal(b.materialsTotal, 448);
  assert.equal(calculate(d).total, 40.11);
});
