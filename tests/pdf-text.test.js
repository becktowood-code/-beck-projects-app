import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { safePdfText, wrapPdfText } from "../src/services/pdfText.js";

test("PDF bullets and curly punctuation remain encodable", async () => {
  const pdf = await PDFDocument.create();
  for (const name of [StandardFonts.Helvetica, StandardFonts.HelveticaBold]) {
    const font = await pdf.embedFont(name);
    const text = "• Install homeowner’s “selected” tiles.";
    assert.equal(safePdfText(text), text);
    assert.doesNotThrow(() => font.encodeText(text));
  }
});

test("PDF wraps whole words and preserves paragraph breaks", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const width = font.widthOfTextAtSize("Install new", 10);
  assert.deepEqual(wrapPdfText("Install new flooring\n\n• Tile", font, 10, width),
    ["Install new", "flooring", "", "• Tile"]);
});

test("overlong tokens wrap within margins without losing characters", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const value = "abcdefghijklmnopqrstuvxyz".repeat(5);
  const lines = wrapPdfText(value, font, 10, 60);
  assert.equal(lines.join(""), value);
  assert.ok(lines.every(line => font.widthOfTextAtSize(line, 10) <= 60));
});

