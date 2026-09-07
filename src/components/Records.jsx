import React, { useState } from "react";
import {
  calculate,
  csvRecords,
  filterRecords,
  money,
} from "../domain/invoice.js";
import { download } from "../services/download.js";
export default function Records({ docs, open }) {
  const [filters, setFilters] = useState({
    query: "",
    year: "",
    status: "",
    type: "Invoice",
    dateBasis: "date",
  });
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const years = [
    ...new Set(
      docs
        .flatMap((d) => [d.date?.slice(0, 4), d.paidDate?.slice(0, 4)])
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const filtered = filterRecords(docs, filters),
    invoices = filtered.filter((d) => d.type === "Invoice");
  const summary = invoices.reduce(
    (s, d) => {
      const t = calculate(d);
      if (d.status === "Issued" || d.status === "Paid") {
        s.issued += t.total;
        s.tax += t.tax;
      }
      if (d.status === "Paid") {
        s.received += t.total;
        s.paidTax += t.tax;
      }
      if (d.status === "Issued") s.unpaid += t.balance;
      return s;
    },
    { issued: 0, tax: 0, received: 0, paidTax: 0, unpaid: 0 },
  );
  return (
    <main className="records">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your business, on record</p>
          <h1>Invoice records</h1>
          <p className="muted">
            Search every document. Review invoice dates or payment years.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            download(
              new Blob([csvRecords(filtered)], {
                type: "text/csv;charset=utf-8",
              }),
              "high-amps-records.csv",
            )
          }
        >
          Export filtered CSV
        </button>
      </div>
      <div className="filters card">
        <label>
          Search records
          <input
            placeholder="Number, customer, contractor or project"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
          />
        </label>
        <label>
          Document type
          <select
            aria-label="Document type"
            value={filters.type}
            onChange={(e) => set("type", e.target.value)}
          >
            <option value="">All documents</option>
            <option>Invoice</option>
            <option>Quote</option>
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {["Draft", "Issued", "Paid", "Void"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Year
          <select
            aria-label="Year"
            value={filters.year}
            onChange={(e) => set("year", e.target.value)}
          >
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Year based on
          <select
            aria-label="Year based on"
            value={filters.dateBasis}
            onChange={(e) => set("dateBasis", e.target.value)}
          >
            <option value="date">Invoice date</option>
            <option value="paidDate">Paid date</option>
          </select>
        </label>
      </div>
      <div className="stats">
        {[
          ["Issued invoice total", summary.issued],
          ["Received · paid invoices", summary.received],
          ["Outstanding", summary.unpaid],
          ["Tax · issued invoices", summary.tax],
          ["Tax · paid invoices", summary.paidTax],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </div>
      <p className="muted">
        Totals use the current filters. Drafts, voids and quotes are excluded.
        Received totals cover fully paid invoices; legacy partial payments
        remain in the CSV. Paid records without a paid date are excluded from
        specific payment years.
      </p>
      <div className="card table-scroll">
        <table className="records-table">
          <thead>
            <tr>
              {[
                "Document",
                "Date / paid date",
                "Customer / contractor",
                "Status",
                "Subtotal",
                "Tax",
                "Total",
                "Balance",
                "",
              ].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const t = calculate(d);
              return (
                <tr key={d.id}>
                  <td>
                    <button
                      className="record-number"
                      aria-label={`Open document ${d.number}`}
                      onClick={() => open(d.id)}
                    >
                      {d.number}
                    </button>
                    <small>{d.type}</small>
                  </td>
                  <td>
                    {d.date}
                    <small>
                      {d.status === "Paid"
                        ? `Paid: ${d.paidDate || "Date not recorded"}`
                        : "Unpaid"}
                    </small>
                  </td>
                  <td>
                    {d.customerName || "—"}
                    <small>{d.contractorName || d.projectTitle}</small>
                  </td>
                  <td>
                    <span className={`badge ${d.status.toLowerCase()}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>{money(t.subtotal)}</td>
                  <td>{money(t.tax)}</td>
                  <td>
                    <strong>{money(t.total)}</strong>
                  </td>
                  <td>{money(d.status === "Void" ? 0 : t.balance)}</td>
                  <td>
                    <button className="secondary" onClick={() => open(d.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty">
            <h2>No matching records</h2>
            <p>Create an invoice or change your filters.</p>
          </div>
        )}
      </div>
      <p className="muted">
        {filtered.length} record{filtered.length === 1 ? "" : "s"} · Records are
        retained; use Void to cancel an unpaid document.
      </p>
    </main>
  );
}
