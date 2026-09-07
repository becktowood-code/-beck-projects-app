import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { InvoiceRepository } from "../src/storage/repository.js";
import {
  blankDocument,
  calculate,
  csvRecords,
  filterRecords,
  today,
  transition,
} from "../src/domain/invoice.js";
const repo = () => new InvoiceRepository(`test-${crypto.randomUUID()}`);
const storage = (data) => ({ getItem: (key) => data[key] ?? null });

test("currency rounds each extended line then tax, including markup", () => {
  const d = blankDocument("HA-1");
  d.labor = [{ description: "Work", hours: 1.5, rate: 150 }];
  d.materials = [{ description: "Part", qty: 3, cost: 1.15, markup: 20 }];
  assert.deepEqual(calculate(d), {
    subtotal: 229.14,
    tax: 16.04,
    total: 245.18,
    paid: 0,
    balance: 245.18,
  });
});
test("draft -> issued -> corrected -> reopened -> reissued -> paid and immutable", async () => {
  const r = repo();
  let d = await r.create();
  d.customerName = "Customer";
  d = await r.save(d, { action: "issue" });
  assert.equal(d.status, "Issued");
  d.notes = "Correction";
  d = await r.save(d);
  assert.equal(d.status, "Issued");
  d = await r.save(d, { action: "reopen" });
  assert.equal(d.status, "Draft");
  d = await r.save(d, { action: "issue" });
  d = await r.save(d, {
    action: "paid",
    detail: { paidDate: today(), paymentMethod: "Zelle" },
  });
  assert.equal(d.status, "Paid");
  assert.equal(calculate(d).balance, 0);
  for (const action of ["save", "reopen", "issue", "void", "paid"])
    await assert.rejects(
      r.save({ ...d, status: "Draft" }, { action, detail: { reason: "try" } }),
      /locked/,
    );
  assert.equal((await r.get(d.id)).notes, "Correction");
  assert.equal((await (await r.db()).getAll("revisions")).length, 5);
});
test("finalization validates selected bill-to; quotes cannot be marked paid", async () => {
  const r = repo();
  let d = await r.create("Quote");
  await assert.rejects(r.save(d, { action: "issue" }), /recipient/);
  d.recipient = "contractor";
  d.contractorName = "General contractor";
  d = await r.save(d, { action: "issue" });
  await assert.rejects(
    r.save(d, { action: "paid", detail: { paidDate: today() } }),
    /not allowed/,
  );
});
test("paid date validation rejects invalid and future dates", () => {
  let d = blankDocument("HA-2");
  d.customerName = "C";
  d = transition(d, "issue");
  for (const paidDate of ["", "2026-02-30", "2999-01-01"])
    assert.throws(() => transition(d, "paid", { paidDate }), /valid paid date/);
});
test("void retains record and requires a reason", async () => {
  const r = repo();
  let d = await r.create();
  await assert.rejects(
    r.save(d, { action: "void", detail: { reason: "" } }),
    /reason/,
  );
  d = await r.save(d, { action: "void", detail: { reason: "Duplicate job" } });
  assert.equal((await r.list()).length, 1);
  await assert.rejects(r.save(d), /locked/);
});
test("stale tabs cannot overwrite paid records or newer corrections", async () => {
  const r = repo();
  const d = await r.create();
  const newer = await r.save({ ...d, notes: "new" });
  await assert.rejects(r.save({ ...d, notes: "stale" }), /another tab/);
  assert.equal((await r.get(d.id)).notes, "new");
  await assert.rejects(r.save({ ...newer, status: "Paid" }), /lifecycle/);
});
test("number allocation is atomic and duplicate numbers are rejected", async () => {
  const r = repo();
  const docs = await Promise.all(Array.from({ length: 8 }, () => r.create()));
  assert.equal(new Set(docs.map((d) => d.number)).size, 8);
  await assert.rejects(
    r.save({ ...docs[1], number: docs[0].number }),
    /already in use/,
  );
});
test("attachments persist as blobs separately, and revision references remain available", async () => {
  const r = repo();
  let d = await r.create();
  const id = crypto.randomUUID();
  const blob = new Blob(["receipt bytes"], { type: "application/pdf" });
  d.attachments = [
    { id, name: "Receipt.pdf", type: "application/pdf", showOnInvoice: true },
  ];
  d = await r.save(d, { uploads: [{ id, blob }] });
  const other = new InvoiceRepository(r.name);
  assert.equal(await (await other.attachment(id)).blob.text(), "receipt bytes");
  assert.equal(
    JSON.stringify(await other.get(d.id)).includes("receipt bytes"),
    false,
  );
  d.attachments = [];
  await r.save(d);
  assert.ok(await r.attachment(id));
});
test("missing blob fails atomically without updating invoice", async () => {
  const r = repo();
  let d = await r.create();
  d.notes = "should not save";
  d.attachments = [{ id: "missing", name: "No.pdf" }];
  await assert.rejects(r.save(d), /Missing attachment/);
  assert.notEqual((await r.get(d.id)).notes, "should not save");
});
test("legacy migration is idempotent, preserves numbers, payments and missing uploads", async () => {
  const r = repo();
  const old = {
    ...blankDocument("HA-0042"),
    status: "Sent",
    photos: [{ name: "Lost.jpg", type: "image/jpeg", notSaved: true }],
    payments: [{ amount: 10, date: "2025-04-02" }],
  };
  const s = storage({ bp_docs: JSON.stringify([old]), ha_counter: "43" });
  await r.migrate(s);
  await r.migrate(s);
  const [d] = await r.list();
  assert.equal(d.status, "Issued");
  assert.equal(d.attachments[0].missing, true);
  assert.equal(calculate(d).paid, 10);
  assert.equal((await r.create()).number, "HA-0043");
  assert.ok(s.getItem("bp_docs"));
});
test("migration parses legacy inline uploads into separate blobs", async () => {
  const r = repo();
  const old = {
    ...blankDocument("HA-9"),
    files: [
      {
        name: "hello.txt",
        data: "data:application/pdf;base64,aGVsbG8=",
        type: "application/pdf",
      },
    ],
  };
  await r.migrate(storage({ bp_docs: JSON.stringify([old]) }));
  const [d] = await r.list();
  assert.equal(
    await (await r.attachment(d.attachments[0].id)).blob.text(),
    "hello",
  );
  assert.equal(d.files, undefined);
});
test("malformed legacy storage is preserved and migration can retry", async () => {
  const r = repo();
  await assert.rejects(r.migrate(storage({ bp_docs: "invalid json" })));
  assert.equal(
    await (await r.db()).get("settings", "legacyMigrated"),
    undefined,
  );
  await r.migrate(storage({ bp_docs: "[]" }));
  assert.equal(await (await r.db()).get("settings", "legacyMigrated"), true);
});
test("backup restore never overwrites or unlocks a paid record", async () => {
  const r = repo();
  let d = await r.create();
  d.customerName = "Client";
  d = await r.save(d, { action: "issue" });
  d = await r.save(d, { action: "paid", detail: { paidDate: today() } });
  const backup = {
    format: "high-amps-backup",
    schemaVersion: 1,
    documents: [{ ...d, status: "Draft" }],
    attachments: [],
  };
  assert.deepEqual(await r.restore(backup), { added: 0, skipped: 1 });
  assert.equal((await r.get(d.id)).status, "Paid");
  const fresh = repo();
  backup.documents = [d];
  assert.deepEqual(await fresh.restore(backup), { added: 1, skipped: 0 });
  assert.equal((await fresh.get(d.id)).status, "Paid");
});
test("restore validates attachment completeness before any writes", async () => {
  const r = repo();
  const d = {
    ...blankDocument("HA-1"),
    version: 1,
    updatedAt: new Date().toISOString(),
    attachments: [{ id: "lost" }],
  };
  await assert.rejects(
    r.restore({
      format: "high-amps-backup",
      schemaVersion: 1,
      documents: [d],
      attachments: [],
    }),
    /missing attachments/,
  );
  assert.equal((await r.list()).length, 0);
});
test("record year can follow payment date across year boundary; search includes contractors", () => {
  const d = {
    ...blankDocument("HA-1"),
    date: "2025-12-31",
    paidDate: "2026-01-03",
    status: "Paid",
    contractorName: "Acme",
  };
  assert.equal(
    filterRecords([d], { year: "2026", dateBasis: "paidDate", query: "acme" })
      .length,
    1,
  );
  assert.equal(
    filterRecords([d], { year: "2026", dateBasis: "date" }).length,
    0,
  );
});
test("CSV escapes quotes, newlines and spreadsheet formulas and includes financial columns", () => {
  const d = blankDocument("HA-1");
  d.customerName = '=HYPERLINK("bad")';
  d.contractorName = 'A,"B"\nC';
  const csv = csvRecords([d]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"A,""B""\nC"'));
  assert.ok(csv.includes('"Paid date"'));
  assert.ok(csv.includes('"160.50"'));
});

test("legacy partially paid status is never mistaken for a full payment lock", async () => {
  const r = repo();
  await r.migrate(
    storage({
      bp_docs: JSON.stringify([
        {
          ...blankDocument("HA-1"),
          status: "Partially paid",
          payments: [{ amount: 20 }],
        },
      ]),
    }),
  );
  const [d] = await r.list();
  assert.notEqual(d.status, "Paid");
  assert.equal(calculate(d).paid, 20);
});

test("missing included legacy attachments must be resolved before locking paid", () => {
  const d = {
    ...blankDocument("HA-1"),
    status: "Issued",
    customerName: "Client",
    attachments: [
      { id: "lost", name: "Receipt", missing: true, showOnInvoice: true },
    ],
  };
  assert.throws(
    () => transition(d, "paid", { paidDate: today() }),
    /missing attachments/,
  );
});
