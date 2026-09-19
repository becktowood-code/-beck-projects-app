import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import logoUrl from "../../High Amps - Logo - Logo IG.png";
import {
  calculate,
  billingBreakdown,
  money,
  COMPANY,
} from "../domain/invoice.js";

export { download } from "./download.js";
const safe = (value) =>
  String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\n\xA0-\xFF]/g, "?");
export async function createInvoicePdf(doc, repository, { smaller = false } = {}) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = doc.company || COMPANY,
    totals = calculate(doc),
    breakdown = billingBreakdown(doc);
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
  function amount(value) {
    const label = money(value);
    ensure(15);
    page.drawText(label, {
      x: 570 - regular.widthOfTextAtSize(label, 10),
      y,
      size: 10,
      font: regular,
      color: ink,
    });
    y -= 15;
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
  text(
    `Status: ${doc.status} | Invoice date: ${doc.date}${doc.dueDate ? ` | Due date: ${doc.dueDate}` : ""} | ${doc.terms}`,
  );
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
  for (const [title, label, rows, tax, total] of [
    [
      "Labor / Work",
      "Labor Total",
      breakdown.labor,
      breakdown.laborTax,
      breakdown.laborTotal,
    ],
    [
      "Materials",
      "Materials Total",
      breakdown.materials,
      breakdown.materialsTax,
      breakdown.materialsTotal,
    ],
  ]) {
    heading(title);
    for (const row of rows) {
      text(row.description);
      if (row.source) text("Source: " + row.source, { color: gray });
      if (row.detail) text(row.detail, { color: gray });
      amount(row.net / 100);
    }
    if (tax > 0) text("Sales tax (" + doc.taxRate + "%): " + money(tax / 100));
    ensure(30);
    text(label + ": " + money(total / 100), { font: bold, size: 12 });
  }
  ensure(125);
  y -= 12;
  for (const [label, value] of [
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
  if (
    doc.attachments.some(
      (a) =>
        a.category === "Receipt / material list" && Number(a.invoiceAmount) > 0,
    )
  )
    text("Materials receipts attached", { font: bold });
  let imagePage = null;
  let imageSlot = 0;
  for (const item of doc.attachments.filter((a) => a.showOnInvoice)) {
    if (item.missing)
      throw new Error(`Re-upload or hide the missing attachment: ${item.name}`);
    const stored = await repository.attachment(item.id);
    if (!stored)
      throw new Error(`Attachment could not be loaded: ${item.name}`);
    try {
      if (item.type === "application/pdf") {
        imagePage = null;
        imageSlot = 0;
        const source = await PDFDocument.load(await stored.blob.arrayBuffer());
        // Embed together so shared fonts/images are copied only once per attachment.
        const embeddedPages = await pdf.embedPages(source.getPages());
        for (const embedded of embeddedPages) {
          const p = pdf.addPage([612, 792]);
          const scale = Math.min(306 / embedded.width, 396 / embedded.height);
          p.drawPage(embedded, {
            x: (612 - embedded.width * scale) / 2,
            y: 60 + (680 - embedded.height * scale) / 2,
            width: embedded.width * scale,
            height: embedded.height * scale,
          });
          p.drawText(safe(item.title || item.name).slice(0, 90), {
            x: 42,
            y: 37,
            size: 8,
            font: regular,
          });
        }
      } else {
        const embedded = await embedAttachmentImage(pdf, stored.blob);
        if (!imagePage || imageSlot === 2) {
          imagePage = pdf.addPage([612, 792]);
          imageSlot = 0;
        }
        const p = imagePage,
          boxTop = imageSlot === 0 ? 730 : 370,
          boxHeight = 300,
          scale = Math.min(528 / embedded.width, boxHeight / embedded.height);
        p.drawImage(embedded, {
          x: (612 - embedded.width * scale) / 2,
          y: boxTop - boxHeight + (boxHeight - embedded.height * scale) / 2,
          width: embedded.width * scale,
          height: embedded.height * scale,
        });
        p.drawText(safe(item.title || item.name).slice(0, 90), {
          x: 42,
          y: boxTop - boxHeight - 14,
          size: 8,
          font: regular,
        });
        imageSlot += 1;
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
  if (smaller) {
    const { optimizeScannedImages } = await import("./optimizePdf.js");
    await optimizeScannedImages(pdf);
  }
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

async function embedAttachmentImage(pdf, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Keep JPEG compression intact instead of expanding photos into PNGs.
  // Camera files with EXIF metadata use the existing browser conversion so
  // orientation remains identical to previous downloads.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && !hasExif(bytes)) {
    return pdf.embedJpg(bytes);
  }
  return pdf.embedPng(await imagePng(blob));
}
function hasExif(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && bytes[offset + 4] === 0x45 && bytes[offset + 5] === 0x78 && bytes[offset + 6] === 0x69 && bytes[offset + 7] === 0x66) return true;
    offset += length + 2;
  }
  return false;
}
