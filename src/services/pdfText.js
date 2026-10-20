export const safePdfText = (value) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\n\xA0-\xFF•‘’“”]/g, "?");

export function wrapPdfText(value, font, size, width) {
  const lines = [];
  for (const paragraph of safePdfText(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      // Only split a token when it cannot fit on an otherwise empty line.
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
