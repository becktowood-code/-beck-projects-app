import React, { useState } from "react";

export default function PastInvoiceImport({ onImport, disabled }) {
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState({
    number: "",
    date: "",
    recipient: "customer",
    name: "",
    subtotal: "",
    taxRate: "7",
    status: "Draft",
    paidDate: "",
  });
  const set = (key, value) => setFields((current) => ({ ...current, [key]: value }));
  return (
    <section className="card import-card">
      <h2>Import a past invoice</h2>
      <p>
        Upload the original PDF or image and enter the record details. The file
        stays attached to the searchable tax record.
      </p>
      <form onSubmit={(event) => { event.preventDefault(); onImport({ file, ...fields }); }}>
        <label>
          Original invoice PDF or image
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            required
            onChange={(event) => setFile(event.target.files[0] || null)}
          />
        </label>
        <div className="two">
          <label>Invoice number<input required value={fields.number} onChange={(e) => set("number", e.target.value)} /></label>
          <label>Invoice date<input required type="date" value={fields.date} onChange={(e) => set("date", e.target.value)} /></label>
          <label>Bill to<select value={fields.recipient} onChange={(e) => set("recipient", e.target.value)}><option value="customer">Customer</option><option value="contractor">Contractor</option></select></label>
          <label>{fields.recipient === "customer" ? "Customer" : "Contractor"} name<input required value={fields.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label>Subtotal ($)<input required type="number" min="0" step="0.01" value={fields.subtotal} onChange={(e) => set("subtotal", e.target.value)} /></label>
          <label>Tax rate (%)<input required type="number" min="0" max="100" step="0.01" value={fields.taxRate} onChange={(e) => set("taxRate", e.target.value)} /></label>
          <label>Payment status<select value={fields.status} onChange={(e) => set("status", e.target.value)}><option>Draft</option><option>Issued</option><option>Paid</option><option>Void</option></select></label>
          {fields.status === "Paid" && <label>Paid date<input required type="date" value={fields.paidDate} onChange={(e) => set("paidDate", e.target.value)} /></label>}
        </div>
        <button disabled={disabled || !file} type="submit">Import past invoice</button>
      </form>
    </section>
  );
}
