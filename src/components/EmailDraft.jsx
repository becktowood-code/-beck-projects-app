import React, { useState } from "react";
import { invoiceEmail, emailLink } from "../domain/email.js";
import { Field } from "./Editor.jsx";

export default function EmailDraft({ doc, dirty, busy }) {
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState("");
  if (!["Issued", "Paid"].includes(doc.status)) return null;
  const disabled = dirty || busy;
  const update = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setCopied("");
  };
  return (
    <section className="card" aria-label="Invoice email">
      <button
        className="secondary"
        disabled={disabled}
        onClick={() => {
          setDraft(invoiceEmail(doc));
          setCopied("");
        }}
      >
        Draft email
      </button>
      <p className="muted">
        {dirty
          ? "Save your changes before creating an email draft."
          : "Review your message, download the PDF, and attach it in your email app before sending."}
      </p>
      {draft && !dirty && (
        <div>
          <h2>Email draft</h2>
          <Field
            label="Email recipient"
            type="email"
            value={draft.to}
            onChange={(v) => update("to", v)}
          />
          {!draft.to && (
            <p className="muted">
              No email address is saved for this recipient. Enter it here or in
              your email app.
            </p>
          )}
          <Field
            label="Email subject"
            value={draft.subject}
            onChange={(v) => update("subject", v)}
          />
          <label>
            Email message
            <textarea
              aria-label="Email message"
              rows={14}
              value={draft.body}
              onChange={(e) => update("body", e.target.value)}
            />
          </label>
          <div className="button-row">
            <a className="button" href={emailLink(draft)}>
              Open in email app
            </a>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`,
                  );
                  setCopied(
                    "Email text copied. Attach the downloaded PDF before sending.",
                  );
                } catch {
                  setCopied(
                    "Could not copy automatically. Select and copy the message above.",
                  );
                }
              }}
            >
              Copy email text
            </button>
            <button className="quiet" onClick={() => setDraft(null)}>
              Close email draft
            </button>
          </div>
          <p className="muted">
            The PDF is not attached automatically. If your email app does not
            open, copy the email text into a new message.
          </p>
          {copied && <p role="status">{copied}</p>}
        </div>
      )}
    </section>
  );
}
