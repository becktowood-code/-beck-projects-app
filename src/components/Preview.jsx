import React from "react";
import { documentPresentation } from "../domain/documentPresentation.js";
import logoUrl from "../../High Amps - Logo - Logo IG.png";
import {
  calculate,
  COMPANY,
  billingBreakdown,
  money,
} from "../domain/invoice.js";
export function Logo() {
  return (
    <div className="brand">
      <img src={logoUrl} alt="High-Amps Electrical Services logo" />
      <div>
        <strong>HIGH-AMPS</strong>
        <span>Electrical Services</span>
      </div>
    </div>
  );
}
export default function Preview({ doc }) {
  const view = documentPresentation(doc);
  const t = calculate(doc),
    breakdown = billingBreakdown(doc),
    c = doc.company || COMPANY;
  return (
    <article className="paper">
      <div className="paper-head">
        <Logo />
        <div>
          <h2>{doc.type}</h2>
          <strong>{doc.number}</strong>
          <p>{view.dateLabel}: {doc.date}</p>
          {view.deadline && <p>{view.deadlineLabel}: {view.deadline}</p>}
          <span className={`badge ${doc.status.toLowerCase()}`}>
            {doc.status}
          </span>
        </div>
      </div>
      <p className="business-address">
        {c.address}
        <br />
        {c.phone}
        <br />
        {c.email}
      </p>
      <hr />
      <div className="two">
        <div>
          <h3>{view.recipientLabel}</h3>
          <strong>{doc[doc.recipient + "Name"] || "Recipient name"}</strong>
          <p className="prewrap">
            {[
              doc[doc.recipient + "Address"],
              doc[doc.recipient + "Phone"],
              doc[doc.recipient + "Email"],
            ]
              .filter(Boolean)
              .join("\n")}
          </p>
        </div>
        <div>
          {view.quote && <><h3>Quote terms</h3><p className="prewrap">{view.quoteTerms}</p></>}
          <h3>{view.quote ? "Payment terms after acceptance (future invoice)" : "Terms"}</h3>
          <p>{doc.terms}</p>
          {!view.quote && doc.paidDate && <p>Paid on {doc.paidDate}</p>}
        </div>
      </div>
      {doc.customerName && doc.contractorName && (
        <p>
          Customer: {doc.customerName}
          <br />
          Contractor: {doc.contractorName}
        </p>
      )}
      <h2>{doc.projectTitle}</h2>
      <p>{doc.jobAddress}</p>
      {[
        [
          view.quote ? "Proposed Labor / Work" : "Labor / Work",
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
      ].map(([title, label, rows, tax, total]) => (
        <section key={title} aria-label={title}>
          <h3>{title}</h3>
          <table className="invoice-lines">
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.description}
                    {row.source && <small>Source: {row.source}</small>}
                    {row.detail && <small>{row.detail}</small>}
                  </td>
                  <td>{money(row.net / 100)}</td>
                </tr>
              ))}
              {tax > 0 && (
                <tr>
                  <td>Sales tax ({doc.taxRate}%)</td>
                  <td>{money(tax / 100)}</td>
                </tr>
              )}
              <tr className="section-total">
                <th scope="row">{label}</th>
                <td>
                  <strong>{money(total / 100)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      <div className="totals">
        {[
          [view.totalLabel, t.total],
          ...(!view.quote ? [["Paid", t.paid], ["Balance due", doc.status === "Void" ? 0 : t.balance]] : []),
        ].map(([label, value]) => (
          <div className={label === view.totalLabel ? "grand" : ""} key={label}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </div>
      {view.quote ? <p>{view.notice}</p> : <><h3>Payment methods</h3><p className="prewrap">{c.payment}</p></>}
      <p className="prewrap">{doc.notes}</p>
      {doc.attachments.some(
        (a) =>
          a.category === "Receipt / material list" &&
          Number(a.invoiceAmount) > 0,
      ) && <p className="muted">Materials receipts attached</p>}
      {doc.status === "Void" && <p>Void reason: {doc.voidReason}</p>}
      {doc.attachments.some((a) => a.showOnInvoice) && (
        <div className="attachment-summary">
          <h3>Included attachments</h3>
          {doc.attachments
            .filter((a) => a.showOnInvoice)
            .map((a) => (
              <p key={a.id}>
                {a.title || a.name}
                {a.missing ? " — missing original" : ""}
              </p>
            ))}
          <small>Appended as full pages in the downloaded PDF.</small>
        </div>
      )}
    </article>
  );
}
