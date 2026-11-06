import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { calculate, billingBreakdown, money, COMPANY } from "../domain/invoice.js";
import { safePdfText, wrapPdfText } from "./pdfText.js";

// A receipt is derived from the immutable paid invoice: no separate editable
// record, counter, or payment verification is implied.
export async function createReceiptPdf(doc) {
  if (doc.type !== "Invoice" || doc.status !== "Paid")
    throw new Error("A payment receipt is available only for paid invoices.");

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = doc.company || COMPANY;
  const totals = calculate(doc);
  const breakdown = billingBreakdown(doc);
  const dark = rgb(0.1, 0.15, 0.22);
  const muted = rgb(0.35, 0.4, 0.46);
  const accent = rgb(0.9, 0.64, 0.1);
  let page = pdf.addPage([612, 792]);
  let y = 746;
  const addPage = () => {
    page = pdf.addPage([612, 792]);
    y = 744;
  };
  function line(value, opts = {}) {
    const size = opts.size || 10;
    const font = opts.bold ? bold : regular;
    const color = opts.muted ? muted : dark;
    for (const part of wrapPdfText(String(value ?? ""), font, size, 518)) {
      if (y < 58) addPage();
      page.drawText(safePdfText(part), { x: 45, y, size, font, color });
      y -= size + 7;
    }
  }
  function section(title) {
    y -= 13;
    line(title, { bold: true, size: 12 });
  }
  line(company.name, { bold: true, size: 17 });
  for (const value of [company.address, company.phone, company.email])
    if (value) line(value, { muted: true });
  y -= 5;
  page.drawRectangle({ x: 45, y, width: 522, height: 3, color: accent });
  y -= 31;
  line("PAYMENT RECEIPT", { bold: true, size: 20 });
  line("PAID IN FULL", { bold: true, size: 13 });
  line("Receipt number: " + doc.number + "-R1");
  line("Original invoice: " + doc.number);
  line("Invoice date: " + (doc.date || "Not recorded"));
  line("Payment date: " + (doc.paidDate || "Not recorded (legacy invoice)"));
  line("Payment method: " + (doc.paymentMethod || "Not recorded"));
  if (doc.paymentReference) line("Payment reference: " + doc.paymentReference);
  section("Received from");
  const prefix = doc.recipient === "contractor" ? "contractor" : "customer";
  for (const value of [
    doc[prefix + "Name"],
    doc[prefix + "Address"],
    doc[prefix + "Phone"],
    doc[prefix + "Email"],
  ]) if (value) line(value);
  if (doc.jobAddress) line("Job address: " + doc.jobAddress);
  if (doc.projectTitle) line("Project: " + doc.projectTitle);
  section("Services and charges");
  for (const item of [...breakdown.labor, ...breakdown.materials]) {
    line(item.description + " - " + money((item.net + item.tax) / 100));
  }
  y -= 9;
  line("Labor subtotal: " + money(breakdown.laborNet / 100));
  line("Materials subtotal: " + money(breakdown.materialsNet / 100));
  line("Sales tax: " + money(totals.tax));
  line("Invoice total: " + money(totals.total), { bold: true, size: 12 });
  line("Amount received: " + money(totals.paid), { bold: true, size: 12 });
  line("Balance due: " + money(0), { bold: true });
  y -= 18;
  line("Payment recorded by " + company.name + ". This receipt confirms the recorded payment; it does not independently verify bank settlement.", { muted: true, size: 9 });
  pdf.setTitle("Payment receipt " + doc.number + "-R1");
  pdf.setAuthor(company.name);
  pdf.setSubject("Payment receipt for invoice " + doc.number);
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
