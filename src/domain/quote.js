import { blankDocument, validate } from "./invoice.js";

export function invoiceFromQuote(quote, number) {
  if (quote.type !== "Quote" || quote.status !== "Issued")
    throw new Error("Issue the quote before accepting it.");
  validate(quote, true);
  const fresh = blankDocument(number);
  const invoice = { ...structuredClone(quote), ...Object.fromEntries(
    ["id", "type", "status", "number", "version", "date", "dueDate", "createdAt", "issuedAt", "paidDate", "payments", "history"].map(key => [key, fresh[key]])
  ) };
  for (const key of ["validUntil", "quoteTerms", "acceptedAt", "invoiceId", "invoiceNumber", "voidReason", "paymentMethod", "paymentReference"])
    delete invoice[key];
  invoice.sourceQuoteId = quote.id;
  invoice.sourceQuoteNumber = quote.number;
  invoice.attachments = invoice.attachments.map(a => ({ ...a, id: crypto.randomUUID() }));
  return invoice;
}
