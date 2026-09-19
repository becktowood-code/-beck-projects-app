import {
  PDFArray,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";

// Only recompress simple, opaque scan images. Leave vector text, existing JPEGs,
// masks, indexed color, predictor filters and unsupported color spaces intact.
export async function optimizeScannedImages(pdf) {
  await pdf.flush();
  let optimized = 0;
  for (const [ref, stream] of pdf.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream)) continue;
    const d = stream.dict;
    const name = (key) => d.get(PDFName.of(key))?.toString();
    if (
      name("Subtype") !== "/Image" ||
      name("Filter") !== "/FlateDecode" ||
      name("BitsPerComponent") !== "8"
    )
      continue;
    if (
      ["SMask", "Mask", "ImageMask", "Decode", "DecodeParms"].some((k) =>
        d.has(PDFName.of(k)),
      )
    )
      continue;
    const width = d.lookup(PDFName.of("Width"), PDFNumber).asNumber();
    const height = d.lookup(PDFName.of("Height"), PDFNumber).asNumber();
    if (
      width * height < 500000 ||
      width * height > 20000000 ||
      stream.getContents().length < 100000
    )
      continue;
    const space = d.lookup(PDFName.of("ColorSpace"));
    let components =
      space?.toString() === "/DeviceRGB"
        ? 3
        : space?.toString() === "/DeviceGray"
          ? 1
          : 0;
    if (space instanceof PDFArray && space.get(0)?.toString() === "/ICCBased") {
      const profile = space.lookup(1);
      const count = profile?.dict?.get(PDFName.of("N"))?.toString();
      components = count === "3" ? 3 : count === "1" ? 1 : 0;
    }
    if (!components) continue;
    // Unsupported/corrupt images remain untouched instead of blocking export.
    try {
      const pixels = decodePDFRawStream(stream).decode();
      if (pixels.length !== width * height * components) continue;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext("2d");
        const image = context.createImageData(width, height);
        for (let p = 0, s = 0; p < image.data.length; p += 4, s += components) {
          image.data[p] = pixels[s];
          image.data[p + 1] = pixels[s + (components === 3 ? 1 : 0)];
          image.data[p + 2] = pixels[s + (components === 3 ? 2 : 0)];
          image.data[p + 3] = 255;
        }
        context.putImageData(image, 0, 0);
        const jpeg = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.95),
        );
        if (!jpeg || jpeg.size >= stream.getContents().length * 0.9) continue;
        const bytes = new Uint8Array(await jpeg.arrayBuffer());
        const dict = d.clone(pdf.context);
        dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
        // Canvas emits RGB JPEGs even when the original scan was grayscale.
        if (components === 1)
          dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
        pdf.context.assign(ref, PDFRawStream.of(dict, bytes));
        optimized += 1;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    } catch {
      // Keep the original stream when it cannot be safely converted.
    }
  }
  return optimized;
}
