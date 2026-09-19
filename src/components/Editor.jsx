import React from "react";
import { documentPresentation } from "../domain/documentPresentation.js";
import { COMPANY, locked } from "../domain/invoice.js";
export function Field({ label, value, onChange, type = "text", ...props }) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );
}
export default function Editor({
  doc,
  update,
  addFiles,
  removeFile,
  disabled,
}) {
  const set = (key, value) => update({ [key]: value });
  const view = documentPresentation(doc);
  return (
    <fieldset disabled={disabled || locked(doc)} className="editor-fields">
      <section className="card">
        <h2>Document details</h2>
        <div className="two">
          <Field
            label="Number"
            value={doc.number}
            onChange={(v) => set("number", v)}
          />
          <Field
            label={view.dateLabel}
            type="date"
            value={doc.date}
            onChange={(v) => set("date", v)}
          />
          <Field
            label={view.deadlineLabel}
            type="date"
            value={view.deadline}
            onChange={(v) => set(view.quote ? "validUntil" : "dueDate", v)}
          />
          <Field
            label={doc.type === "Quote" ? "Quote name" : "Invoice name"}
            placeholder="e.g. Men’s Cave electrical rough-in at 123 Main St"
            value={doc.projectTitle}
            onChange={(v) => set("projectTitle", v)}
          />
          <Field
            label="Job address"
            value={doc.jobAddress}
            onChange={(v) => set("jobAddress", v)}
          />
          <Field
            label={view.quote ? "Payment terms after acceptance (future invoice)" : "Payment terms"}
            value={doc.terms}
            onChange={(v) => set("terms", v)}
          />
          <label>
            {view.recipientLabel}
            <select
              aria-label={view.recipientLabel}
              value={doc.recipient}
              onChange={(e) => set("recipient", e.target.value)}
            >
              <option value="customer">Customer</option>
              <option value="contractor">Contractor</option>
            </select>
          </label>
        </div>
        {view.quote && <label>Quote terms<textarea aria-label="Quote terms" value={view.quoteTerms} onChange={(e) => set("quoteTerms", e.target.value)} /></label>}
      </section>
      {["customer", "contractor"].map((kind) => (
        <section className="card" key={kind}>
          <h2>
            {kind === "customer" ? "Customer" : "Contractor / subcontractor"}
          </h2>
          <div className="two">
            {[
              ["Name", "text"],
              ["Email", "email"],
              ["Phone", "tel"],
              ["Address", "text"],
            ].map(([field, type]) => (
              <Field
                key={field}
                label={`${kind === "customer" ? "Customer" : "Contractor"} ${field.toLowerCase()}`}
                type={type}
                value={doc[kind + field]}
                onChange={(v) => set(kind + field, v)}
              />
            ))}
          </div>
        </section>
      ))}
      <section className="card">
        <h2>Work & materials</h2>
        {[
          [
            "labor",
            "Labor",
            {
              description: "Electrical labor",
              hours: 1,
              rate: COMPANY.hourlyRate,
            },
            [
              ["description", "Description"],
              ["hours", "Hours"],
              ["rate", "Rate ($)"],
            ],
          ],
          [
            "materials",
            "Materials",
            { description: "", source: "", qty: 1, cost: 0, markup: 0 },
            [
              ["description", "Description"],
              ["source", "Source / supplier"],
              ["qty", "Quantity"],
              ["cost", "Unit cost ($)"],
              ["markup", "Markup (%)"],
            ],
          ],
          [
            "fixedItems",
            "Fixed costs",
            { description: "", amount: 0 },
            [
              ["description", "Description"],
              ["amount", "Amount ($)"],
            ],
          ],
        ].map(([kind, title, defaults, fields]) => (
          <div className="line-group" key={kind}>
            <h3>{title}</h3>
            {doc[kind].map((row, index) => (
              <div className="line-item" key={row.id}>
                {fields.map(([key, label]) => (
                  <Field
                    key={key}
                    label={`${title} ${index + 1} ${label}`}
                    type={
                      ["description", "source"].includes(key)
                        ? "text"
                        : "number"
                    }
                    min={
                      ["description", "source"].includes(key) ? undefined : 0
                    }
                    step={
                      ["description", "source"].includes(key)
                        ? undefined
                        : "any"
                    }
                    value={row[key]}
                    onChange={(value) =>
                      set(
                        kind,
                        doc[kind].map((r) =>
                          r.id === row.id ? { ...r, [key]: value } : r,
                        ),
                      )
                    }
                  />
                ))}
                <button
                  type="button"
                  className="quiet danger"
                  aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
                  onClick={() =>
                    set(
                      kind,
                      doc[kind].filter((r) => r.id !== row.id),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                set(kind, [
                  ...doc[kind],
                  { id: crypto.randomUUID(), ...defaults },
                ])
              }
            >
              + Add {title.toLowerCase()}
            </button>
          </div>
        ))}
        <div className="two">
          <label className="check">
            <input
              type="checkbox"
              checked={doc.applyTax}
              onChange={(e) => set("applyTax", e.target.checked)}
            />
            Apply sales tax
          </label>
          <Field
            label="Tax rate (%)"
            type="number"
            min="0"
            max="100"
            step="any"
            value={doc.taxRate}
            onChange={(v) => set("taxRate", v)}
          />
        </div>
        <label>
          Notes
          <textarea
            aria-label="Notes"
            value={doc.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
      </section>
      <section className="card">
        <h2>Receipts, material lists & photos</h2>
        <p className="muted">
          Add multiple receipts and enter a description, source and amount for
          each. Enter each purchase once: as manual material items or as a
          receipt amount. Files are retained with this record after saving.
        </p>
        <label>
          Upload receipts / material lists
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => {
              addFiles([...e.target.files], "Receipt / material list");
              e.target.value = "";
            }}
          />
        </label>
        <label>
          Upload job photos
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              addFiles([...e.target.files], "Photo");
              e.target.value = "";
            }}
          />
        </label>
        {doc.attachments.map((a) => (
          <div className="attachment-row" key={a.id}>
            <div>
              <strong>{a.title || a.name}</strong>
              <small>
                {a.category}
                {a.missing ? " · Original file missing — upload again" : ""}
              </small>
            </div>
            {a.category === "Photo" && (
              <Field
                label="Photo title (optional)"
                value={a.title || ""}
                placeholder={a.name}
                onChange={(value) =>
                  set(
                    "attachments",
                    doc.attachments.map((f) =>
                      f.id === a.id ? { ...f, title: value } : f,
                    ),
                  )
                }
              />
            )}
            {a.category === "Receipt / material list" && (
              <div className="receipt-value">
                {[
                  ["description", "Material description"],
                  ["source", "Material source / supplier"],
                ].map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={a[key] || ""}
                    onChange={(value) =>
                      set(
                        "attachments",
                        doc.attachments.map((f) =>
                          f.id === a.id ? { ...f, [key]: value } : f,
                        ),
                      )
                    }
                  />
                ))}
                <Field
                  label="Receipt amount ($)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={a.invoiceAmount}
                  onChange={(value) =>
                    set(
                      "attachments",
                      doc.attachments.map((f) =>
                        f.id === a.id ? { ...f, invoiceAmount: value } : f,
                      ),
                    )
                  }
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(a.taxIncluded)}
                    onChange={(e) =>
                      set(
                        "attachments",
                        doc.attachments.map((f) =>
                          f.id === a.id
                            ? { ...f, taxIncluded: e.target.checked }
                            : f,
                        ),
                      )
                    }
                  />
                  Tax included in receipt total
                </label>
              </div>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={a.showOnInvoice}
                onChange={(e) =>
                  set(
                    "attachments",
                    doc.attachments.map((f) =>
                      f.id === a.id
                        ? { ...f, showOnInvoice: e.target.checked }
                        : f,
                    ),
                  )
                }
              />
              Include in PDF
            </label>
            <button
              type="button"
              className="quiet danger"
              onClick={() => removeFile(a.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </section>
    </fieldset>
  );
}
