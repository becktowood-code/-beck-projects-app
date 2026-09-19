import { calculate, COMPANY, money } from "./invoice.js";

export function invoiceEmail(doc) {
  const company = doc.company || COMPANY;
  const name = doc[`${doc.recipient}Name`]?.trim();
  const total = calculate(doc);
  const quote = doc.type === "Quote";
  const payment = quote
    ? "Please let me know if you have any questions or would like to proceed."
    : doc.status === "Paid"
      ? "Payment received. Thank you for your payment."
      : [
          `Balance due: ${money(total.balance)}`,
          doc.dueDate ? `Due date: ${doc.dueDate}` : "",
          doc.terms ? `Payment terms: ${doc.terms}` : "",
          company.payment ? `\nPayment instructions:\n${company.payment}` : "",
        ]
          .filter(Boolean)
          .join("\n");
  return {
    to: doc[`${doc.recipient}Email`]?.trim() || "",
    subject: `${doc.type} ${doc.number}${doc.projectTitle ? ` — ${doc.projectTitle}` : ""}`,
    body: [
      name ? `Hi ${name},` : "Hello,",
      `Please find attached ${doc.type.toLowerCase()} ${doc.number}${doc.projectTitle ? ` for ${doc.projectTitle}` : ""}.`,
      `${quote ? "Quote total" : "Invoice total"}: ${money(total.total)}`,
      payment,
      quote ? "" : "Please let me know if you have any questions.",
      `Thank you,\n${company.name}\n${company.email}\n${company.phone}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function emailLink({ to, subject, body }) {
  return `mailto:${encodeURIComponent(to.trim().replace(/[\r\n]/g, ""))}?subject=${encodeURIComponent(subject.replace(/[\r\n]/g, " "))}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
}
