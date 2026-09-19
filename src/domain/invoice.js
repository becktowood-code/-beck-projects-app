export const COMPANY = Object.freeze({
  name: "High-Amps Electrical Services",
  address: "18332 181st Cir S, Boca Raton, FL 33498",
  phone: "+1 (561) 579-2642",
  email: "high-amps@outlook.com",
  hourlyRate: 150,
  taxRate: 7,
  terms: "Due on receipt",
  invoicePrefix: "HA",
  payment:
    "Zelle: high-amps@outlook.com\nBank transfer: Beck Projects LLC · Capital One\nAccount and routing information available upon request.",
});
export const today = () => new Date().toLocaleDateString("en-CA");
export const money = (value) =>
  (Number(value) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
export const cents = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100);
export function lineAmount(kind, row) {
  if (kind === "labor") return cents(Number(row.hours) * Number(row.rate));
  if (kind === "materials")
    return cents(
      Number(row.qty) * Number(row.cost) * (1 + Number(row.markup || 0) / 100),
    );
  return cents(row.amount);
}
// Keep each line and its tax in cents so preview, PDF and records agree.
export function billingBreakdown(doc) {
  const rate = Number(doc.taxRate) || 0;
  const makeLine = (kind, row, index) => {
    const net = lineAmount(kind, row);
    const tax =
      doc.applyTax && (kind !== "labor" || doc.recipient !== "contractor")
        ? Math.round((net * rate) / 100)
        : 0;
    return {
      id: kind + "-" + (row.id || index),
      description: row.description || "Material",
      source: row.source || "",
      net,
      tax,
      detail:
        kind === "labor"
          ? row.hours + " hrs × " + money(row.rate)
          : kind === "materials"
            ? row.qty +
              " × " +
              money(row.cost) +
              (Number(row.markup) ? " + " + row.markup + "% markup" : "")
            : "",
    };
  };
  const labor = [
    ...(doc.labor || []).map((r, i) => makeLine("labor", r, i)),
    ...(doc.fixedItems || []).map((r, i) => makeLine("fixedItems", r, i)),
  ];
  const materials = (doc.materials || []).map((r, i) =>
    makeLine("materials", r, i),
  );
  for (const [i, receipt] of (doc.attachments || []).entries()) {
    if (
      receipt.category !== "Receipt / material list" ||
      !Number(receipt.invoiceAmount)
    )
      continue;
    const gross = cents(receipt.invoiceAmount);
    const included = Boolean(receipt.taxIncluded);
    const net =
      doc.applyTax && included
        ? Math.round((gross * 100) / (100 + rate))
        : gross;
    const tax = !doc.applyTax
      ? 0
      : included
        ? gross - net
        : Math.round((net * rate) / 100);
    materials.push({
      id: "receipt-" + (receipt.id || i),
      description:
        receipt.description ||
        receipt.title ||
        receipt.name ||
        "Material receipt",
      source: receipt.source || "",
      detail: "Receipt: " + (receipt.name || "Material receipt"),
      net,
      tax,
    });
  }
  const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
  const laborNet = sum(labor, "net"),
    laborTax = sum(labor, "tax");
  const materialsNet = sum(materials, "net"),
    materialsTax = sum(materials, "tax");
  return {
    labor,
    materials,
    laborNet,
    laborTax,
    materialsNet,
    materialsTax,
    laborTotal: laborNet + laborTax,
    materialsTotal: materialsNet + materialsTax,
  };
}
export function calculate(doc) {
  const b = billingBreakdown(doc);
  const subtotalCents = b.laborNet + b.materialsNet;
  const taxCents = b.laborTax + b.materialsTax;
  const totalCents = b.laborTotal + b.materialsTotal;
  const paidCents =
    doc.status === "Paid"
      ? totalCents
      : (doc.payments || []).reduce((s, p) => s + cents(p.amount), 0);
  return {
    subtotal: subtotalCents / 100,
    tax: taxCents / 100,
    total: totalCents / 100,
    paid: paidCents / 100,
    balance: (totalCents - paidCents) / 100,
  };
}
export function invoiceSummary(doc) {
  const b = billingBreakdown(doc);
  return { work: b.laborNet / 100, materials: b.materialsNet / 100 };
}
export function blankDocument(number, type = "Invoice") {
  return {
    id: crypto.randomUUID(),
    version: 0,
    type,
    status: "Draft",
    number,
    date: today(),
    dueDate: "",
    issuedAt: null,
    paidDate: "",
    recipient: "customer",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    contractorName: "",
    contractorPhone: "",
    contractorEmail: "",
    contractorAddress: "",
    jobAddress: "",
    projectTitle: "",
    notes: "Thank you for choosing High-Amps Electrical Services.",
    terms: COMPANY.terms,
    company: { ...COMPANY },
    taxRate: COMPANY.taxRate,
    applyTax: true,
    labor: [
      {
        id: crypto.randomUUID(),
        description: "Electrical labor",
        hours: 1,
        rate: COMPANY.hourlyRate,
      },
    ],
    materials: [],
    fixedItems: [],
    attachments: [],
    payments: [],
    history: [],
    createdAt: new Date().toISOString(),
  };
}
export const locked = (doc) => doc.status === "Paid" || doc.status === "Void";
export function validate(doc, final = false) {
  if (
    !doc ||
    !doc.id ||
    !["Invoice", "Quote"].includes(doc.type) ||
    !["Draft", "Issued", "Paid", "Void"].includes(doc.status)
  )
    throw new Error("Invalid document.");
  if (!doc.number?.trim()) throw new Error("A document number is required.");
  if (!validDate(doc.date)) throw new Error("Enter a valid invoice date.");
  if (doc.dueDate && !validDate(doc.dueDate))
    throw new Error("Enter a valid due date.");
  if (!["customer", "contractor"].includes(doc.recipient))
    throw new Error("Choose a recipient.");
  if (final && !doc[`${doc.recipient}Name`]?.trim())
    throw new Error("Enter the selected recipient’s name before issuing.");
  if (
    !Number.isFinite(Number(doc.taxRate)) ||
    Number(doc.taxRate) < 0 ||
    Number(doc.taxRate) > 100
  )
    throw new Error("Tax rate must be between 0 and 100.");
  for (const [kind, fields] of Object.entries({
    labor: ["hours", "rate"],
    materials: ["qty", "cost", "markup"],
    fixedItems: ["amount"],
  })) {
    if (!Array.isArray(doc[kind])) throw new Error("Invalid line items.");
    for (const row of doc[kind]) {
      if (final && !row.description?.trim())
        throw new Error("Every line item needs a description.");
      for (const field of fields)
        if (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)
          throw new Error(
            "Line quantities, prices and markup must be zero or positive.",
          );
    }
  }
  if (
    !Number.isSafeInteger(cents(calculate(doc).total)) ||
    calculate(doc).total > 100000000
  )
    throw new Error("Invoice total is too large.");
  if (doc.status === "Paid" && doc.paidDate && !validDate(doc.paidDate))
    throw new Error("Invalid paid date.");
  for (const attachment of doc.attachments || [])
    if (
      attachment.invoiceAmount !== "" &&
      attachment.invoiceAmount != null &&
      (!Number.isFinite(Number(attachment.invoiceAmount)) ||
        Number(attachment.invoiceAmount) < 0)
    )
      throw new Error("Receipt values must be zero or positive.");
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function transition(doc, action, detail = {}) {
  if (locked(doc))
    throw new Error(
      `${doc.status} documents are locked. No admin override is available.`,
    );
  const next = structuredClone(doc);
  if (action === "issue") {
    validate(next, true);
    next.status = "Issued";
    next.issuedAt ||= new Date().toISOString();
  } else if (action === "reopen" && doc.status === "Issued")
    next.status = "Draft";
  else if (
    action === "paid" &&
    doc.status === "Issued" &&
    doc.type === "Invoice"
  ) {
    if (!validDate(detail.paidDate) || detail.paidDate > today())
      throw new Error("Enter a valid paid date, no later than today.");
    if (doc.attachments.some((a) => a.showOnInvoice && a.missing))
      throw new Error(
        "Re-upload or hide missing attachments before marking paid.",
      );
    next.status = "Paid";
    next.paidDate = detail.paidDate;
    next.paymentMethod = detail.paymentMethod || "Other";
    next.paymentReference = detail.paymentReference || "";
  } else if (action === "void") {
    if (!detail.reason?.trim())
      throw new Error("Enter a reason for voiding this document.");
    next.status = "Void";
    next.voidReason = detail.reason.trim();
  } else throw new Error("This status change is not allowed.");
  return next;
}
export function filterRecords(docs, filters) {
  const q = (filters.query || "").toLowerCase();
  return docs.filter(
    (d) =>
      (!filters.type || d.type === filters.type) &&
      (!filters.status || d.status === filters.status) &&
      (!filters.year ||
        (filters.dateBasis === "paidDate" ? d.paidDate : d.date)?.slice(
          0,
          4,
        ) === filters.year) &&
      [
        d.number,
        d.customerName,
        d.contractorName,
        d.projectTitle,
        d.jobAddress,
      ].some((s) => (s || "").toLowerCase().includes(q)),
  );
}
export function csvRecords(docs) {
  const rows = [
    [
      "Number",
      "Type",
      "Status",
      "Invoice date",
      "Issued at",
      "Customer",
      "Contractor",
      "Bill to",
      "Subtotal",
      "Tax",
      "Total",
      "Paid amount",
      "Balance",
      "Paid date",
      "Payment method",
      "Payment reference",
    ],
  ];
  for (const d of docs) {
    const t = calculate(d);
    rows.push([
      d.number,
      d.type,
      d.status,
      d.date,
      d.issuedAt || "",
      d.customerName,
      d.contractorName,
      d.recipient,
      t.subtotal.toFixed(2),
      t.tax.toFixed(2),
      t.total.toFixed(2),
      t.paid.toFixed(2),
      t.balance.toFixed(2),
      d.paidDate || "",
      d.paymentMethod || "",
      d.paymentReference || "",
    ]);
  }
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
