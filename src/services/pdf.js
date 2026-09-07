import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import logoUrl from "../../High Amps - Logo - Logo IG.png";
import { calculate, lineAmount, money, COMPANY } from "../domain/invoice.js";

export { download } from "./download.js";
const safe = (value) =>
  String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\n\xA0-\xFF]/g, "?");
export async function createInvoicePdf(doc, repository) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = doc.company || COMPANY,
    totals = calculate(doc);
  const ink = rgb(0.08, 0.12, 0.18),
    gray = rgb(0.4, 0.44, 0.5),
    gold = rgb(0.95, 0.7, 0.13);
  let page, y;
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 744;
  }
  function ensure(height) {
    if (y - height < 54) {
      newPage();
      text(`${company.name} | ${doc.number} continued`, {
        size: 10,
        color: gray,
      });
      y -= 14;
    }
  }
  function wrap(value, font, size, width) {
    const lines = [];
    for (const paragraph of safe(value).split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  }
  function text(
    value,
    { size = 10, font = regular, x = 42, width = 528, color = ink } = {},
  ) {
    for (const line of wrap(value, font, size, width)) {
      ensure(size + 5);
      page.drawText(line, { x, y, size, font, color });
      y -= size + 5;
    }
  }
  function heading(value) {
    ensure(40);
    y -= 12;
    text(value, { font: bold, size: 12 });
  }
  newPage();
  const logo = await pdf.embedPng(await (await fetch(logoUrl)).arrayBuffer());
  page.drawImage(logo, { x: 42, y: 676, width: 76, height: 76 });
  text(company.name, { x: 132, width: 438, font: bold, size: 16 });
  text(company.address, { x: 132, width: 438 });
  text(`${company.phone} | ${company.email}`, { x: 132, width: 438 });
  y = 650;
  page.drawRectangle({ x: 42, y: 637, width: 528, height: 3, color: gold });
  text(`${doc.type.toUpperCase()} ${doc.number}`, { font: bold, size: 22 });
  text(`Status: ${doc.status} | Date: ${doc.date} | ${doc.terms}`);
  if (doc.status === "Paid")
    text(
      `PAID ${doc.paidDate || "(date not recorded in legacy data)"} | ${doc.paymentMethod || ""}`,
      { font: bold },
    );
  if (doc.status === "Void")
    text(`VOID: ${doc.voidReason || ""}`, { font: bold });
  heading("Bill to");
  text(
    [
      doc[`${doc.recipient}Name`],
      doc[`${doc.recipient}Address`],
      doc[`${doc.recipient}Phone`],
      doc[`${doc.recipient}Email`],
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (doc.customerName && doc.contractorName)
    text(`Customer: ${doc.customerName} | Contractor: ${doc.contractorName}`);
  if (doc.jobAddress) text(`Job address: ${doc.jobAddress}`);
  if (doc.projectTitle) heading(doc.projectTitle);
  for (const [kind, label] of [
    ["labor", "Labor"],
    ["materials", "Materials"],
    ["fixedItems", "Fixed costs"],
  ]) {
    if (!doc[kind].length) continue;
    heading(label);
    for (const row of doc[kind]) {
      const description = wrap(row.description, regular, 10, 330);
      ensure(Math.min(640, description.length * 15 + 32));
      for (let i = 0; i < description.length; i++) {
        ensure(15);
        if (i === 0) {
          const amount = money(lineAmount(kind, row) / 100);
          page.drawText(amount, {
            x: 570 - regular.widthOfTextAtSize(amount, 10),
            y,
            size: 10,
            font: regular,
            color: ink,
          });
        }
        text(description[i], { width: 330 });
      }
      const detail =
        kind === "labor"
          ? `${row.hours} hours x ${money(row.rate)}`
          : kind === "materials"
            ? `${row.qty} x ${money(row.cost)} | Markup ${row.markup || 0}%`
            : "";
      if (detail) text(detail, { size: 9, color: gray });
      y -= 5;
    }
  }
  ensure(125);
  y -= 12;
  for (const [label, value] of [
    ["Subtotal", totals.subtotal],
    [`Tax (${doc.applyTax ? doc.taxRate : 0}%)`, totals.tax],
    ["Total", totals.total],
    ["Paid", totals.paid],
    ["Balance due", doc.status === "Void" ? 0 : totals.balance],
  ])
    text(`${label}: ${money(value)}`, {
      x: 340,
      width: 230,
      font: label === "Total" ? bold : regular,
      size: label === "Total" ? 14 : 10,
    });
  heading("Payment methods");
  text(company.payment);
  if (doc.notes) {
    heading("Notes");
    text(doc.notes);
  }
  for (const item of doc.attachments.filter((a) => a.showOnInvoice)) {
    if (item.missing)
      throw new Error(`Re-upload or hide the missing attachment: ${item.name}`);
    const stored = await repository.attachment(item.id);
    if (!stored)
      throw new Error(`Attachment could not be loaded: ${item.name}`);
    try {
      if (item.type === "application/pdf") {
        const source = await PDFDocument.load(await stored.blob.arrayBuffer());
        for (const sourcePage of source.getPages()) {
          const embedded = await pdf.embedPage(sourcePage);
          const p = pdf.addPage([612, 792]);
          const scale = Math.min(528 / embedded.width, 680 / embedded.height);
          p.drawPage(embedded, {
            x: (612 - embedded.width * scale) / 2,
            y: 60 + (680 - embedded.height * scale) / 2,
            width: embedded.width * scale,
            height: embedded.height * scale,
          });
          p.drawText(safe(item.name).slice(0, 90), {
            x: 42,
            y: 37,
            size: 8,
            font: regular,
          });
        }
      } else {
        const image = await imagePng(stored.blob),
          embedded = await pdf.embedPng(image);
        const p = pdf.addPage([612, 792]),
          scale = Math.min(528 / embedded.width, 680 / embedded.height);
        p.drawImage(embedded, {
          x: (612 - embedded.width * scale) / 2,
          y: 60 + (680 - embedded.height * scale) / 2,
          width: embedded.width * scale,
          height: embedded.height * scale,
        });
        p.drawText(safe(item.name).slice(0, 90), {
          x: 42,
          y: 37,
          size: 8,
          font: regular,
        });
      }
    } catch (error) {
      throw new Error(
        `Could not include ${item.name}. Use an unlocked PDF or a supported image, or hide it before downloading. ${error.message}`,
      );
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${safe(doc.number)} | ${i + 1} / ${pages.length}`, {
      x: 430,
      y: 20,
      size: 8,
      font: regular,
      color: gray,
    }),
  );
  pdf.setTitle(`${doc.type} ${doc.number}`);
  pdf.setAuthor(company.name);
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
async function imagePng(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      2400 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("Image conversion failed.");
    return png.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}
