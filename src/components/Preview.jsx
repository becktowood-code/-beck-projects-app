import React from "react";
import logoUrl from "../../High Amps - Logo - Logo IG.png";
import { calculate, COMPANY, lineAmount, money } from "../domain/invoice.js";
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
  const t = calculate(doc),
    c = doc.company || COMPANY;
  return (
    <article className="paper">
      <div className="paper-head">
        <Logo />
        <div>
          <h2>{doc.type}</h2>
          <strong>{doc.number}</strong>
          <p>{doc.date}</p>
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
          <h3>Bill to</h3>
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
          <h3>Terms</h3>
          <p>{doc.terms}</p>
          {doc.paidDate && <p>Paid on {doc.paidDate}</p>}
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
      {["labor", "materials", "fixedItems"].map(
        (kind) =>
          doc[kind].length > 0 && (
            <div key={kind}>
              <h3>
                {kind === "fixedItems"
                  ? "Fixed costs"
                  : kind === "labor"
                    ? "Labor"
                    : "Materials"}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Details</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {doc[kind].map((row) => (
                    <tr key={row.id}>
                      <td>{row.description}</td>
                      <td>
                        {kind === "labor"
                          ? `${row.hours} hrs × ${money(row.rate)}`
                          : kind === "materials"
                            ? `${row.qty} × ${money(row.cost)}${Number(row.markup) ? ` + ${row.markup}%` : ""}`
                            : ""}
                      </td>
                      <td>{money(lineAmount(kind, row) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
      )}
      <div className="totals">
        {[
          ["Subtotal", t.subtotal],
          [`Tax (${doc.applyTax ? doc.taxRate : 0}%)`, t.tax],
          ["Total", t.total],
          ["Paid", t.paid],
          ["Balance due", doc.status === "Void" ? 0 : t.balance],
        ].map(([label, value]) => (
          <div className={label === "Total" ? "grand" : ""} key={label}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </div>
      <h3>Payment methods</h3>
      <p className="prewrap">{c.payment}</p>
      <p className="prewrap">{doc.notes}</p>
      {doc.status === "Void" && <p>Void reason: {doc.voidReason}</p>}
      {doc.attachments.some((a) => a.showOnInvoice) && (
        <div className="attachment-summary">
          <h3>Included attachments</h3>
          {doc.attachments
            .filter((a) => a.showOnInvoice)
            .map((a) => (
              <p key={a.id}>
                {a.name}
                {a.missing ? " — missing original" : ""}
              </p>
            ))}
          <small>Appended as full pages in the downloaded PDF.</small>
        </div>
      )}
    </article>
  );
}
