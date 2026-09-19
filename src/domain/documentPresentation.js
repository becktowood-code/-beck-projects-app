export const QUOTE_TERMS = "Please confirm acceptance before work begins. Changes to the agreed scope require an updated quote.";
export function documentPresentation(doc) {
  const quote = doc.type === "Quote";
  return {
    quote,
    dateLabel: quote ? "Quote date" : "Invoice date",
    deadlineLabel: quote ? "Valid until" : "Due date",
    deadline: quote ? doc.validUntil : doc.dueDate,
    recipientLabel: quote ? "Prepared for" : "Bill to",
    totalLabel: quote ? "Quoted total" : "Total",
    quoteTerms: doc.quoteTerms ?? QUOTE_TERMS,
    notice: "This is a quote for proposed work, not an invoice. No payment is due on this quote.",
  };
}
