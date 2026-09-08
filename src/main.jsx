import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Editor, { Field } from "./components/Editor.jsx";
import Preview, { Logo } from "./components/Preview.jsx";
import Records from "./components/Records.jsx";
import { locked, today } from "./domain/invoice.js";
import { repository as localRepository } from "./storage/repository.js";
import { compressImage } from "./storage/compressImage.js";
import CloudAccess from "./components/CloudAccess.jsx";
import PastInvoiceImport from "./components/PastInvoiceImport.jsx";
import "./style.css";

function App({ repository, user, signOut }) {
  const [docs, setDocs] = useState([]),
    [current, setCurrent] = useState(null),
    [tab, setTab] = useState("records");
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [uploads, setUploads] = useState([]),
    [payment, setPayment] = useState(null),
    [pdfUrl, setPdfUrl] = useState("");
  const restoreRef = useRef(null),
    operation = useRef(false);
  async function refresh() {
    setDocs(await repository.list());
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await repository.migrate();
        const records = await repository.list();
        if (active) {
          setDocs(records);
          setReady(true);
        }
        navigator.storage?.persist?.().catch(() => {});
      } catch (e) {
        if (active)
          setError(
            `Could not open records: ${e.message}. Original data is unchanged.`,
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  async function run(task) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(
        e.name === "QuotaExceededError"
          ? "Device storage is full. Changes were not saved. Export a backup and free device storage, then retry."
          : e.message,
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function mayLeave() {
    return (
      !dirty || window.confirm("Discard unsaved changes to this document?")
    );
  }
  async function importBrowser() {
    if (
      !window.confirm(
        `Copy saved invoices and attachments from this browser into ${user.email}? Local originals will be kept.`,
      )
    )
      return;
    await run(async () => {
      await localRepository.migrate();
      const result = await repository.restore(await localRepository.backup());
      await refresh();
      setMessage(
        `Copied ${result.added} records to your cloud account. Skipped ${result.skipped} existing records. Local originals are unchanged.`,
      );
    });
  }
  async function importPastInvoice(data) {
    await run(async () => {
      const d = await repository.create("Invoice");
      const attachment = {
        id: crypto.randomUUID(),
        name: data.file.name,
        category: "Past invoice",
        mimeType: data.file.type,
        size: data.file.size,
        showOnInvoice: false,
      };
      let candidate = {
        ...d,
        number: data.number.trim(),
        date: data.date,
        recipient: data.recipient,
        [`${data.recipient}Name`]: data.name.trim(),
        taxRate: Number(data.taxRate),
        applyTax: Number(data.taxRate) > 0,
        labor: [],
        materials: [],
        fixedItems: [{ id: crypto.randomUUID(), description: "Imported invoice total before tax", amount: Number(data.subtotal) }],
        attachments: [attachment],
      };
      candidate = await repository.save(candidate, { uploads: [{ id: attachment.id, blob: data.file }] });
      if (data.status === "Issued" || data.status === "Paid")
        candidate = await repository.save(candidate, { action: "issue" });
      if (data.status === "Paid")
        candidate = await repository.save(candidate, { action: "paid", detail: { paidDate: data.paidDate, paymentMethod: "Imported" } });
      if (data.status === "Void")
        candidate = await repository.save(candidate, { action: "void", detail: { reason: "Imported as void" } });
      await refresh();
      setCurrent(candidate);
      setTab("document");
      setMessage(`Imported ${candidate.number} with the original file attached.`);
    });
  }
  async function leaveAccount() {
    if (!mayLeave()) return;
    await run(signOut);
  }
  useEffect(() => {
    if (!repository.cloud) return;
    const reload = () =>
      repository
        .list()
        .then(setDocs)
        .catch((e) => setError(`Cloud refresh failed: ${e.message}`));
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
    };
  }, [repository]);
  async function newDoc(type) {
    if (!mayLeave()) return;
    await run(async () => {
      const d = await repository.create(type);
      setCurrent(d);
      setUploads([]);
      setDirty(false);
      setTab("document");
      await refresh();
      setMessage("Draft created and saved to records.");
    });
  }
  async function open(id) {
    if (!mayLeave()) return;
    await run(async () => {
      setCurrent(await repository.get(id));
      setUploads([]);
      setDirty(false);
      setTab("document");
    });
  }
  function update(patch) {
    if (!current || locked(current) || busy) return;
    setCurrent((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage("");
  }
  async function addFiles(files, category) {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
    ];
    if (files.some((f) => !allowed.includes(f.type))) {
      setError("Use PNG, JPEG, WebP or PDF files.");
      return;
    }
    if (files.some((f) => f.size > 30 * 1024 * 1024)) {
      setError("Each attachment must be 30 MB or smaller.");
      return;
    }
    let compressed;
    try {
      compressed = await Promise.all(files.map(compressImage));
    } catch (e) {
      setError(e.message);
      return;
    }
    const added = compressed.map((blob, index) => ({
      id: crypto.randomUUID(),
      blob,
      originalName: files[index].name,
    }));
    setUploads((old) => [...old, ...added]);
    update({
      attachments: [
        ...current.attachments,
        ...added.map(({ id, blob, originalName }) => ({
          id,
          name: originalName,
          type: blob.type,
          size: blob.size,
          category,
          showOnInvoice: true,
          invoiceAmount: category === "Receipt / material list" ? "" : undefined,
          taxIncluded: category === "Receipt / material list" ? true : undefined,
          missing: false,
        })),
      ],
    });
  }
  async function save(action = "save", detail = {}) {
    const d = await repository.save(current, { action, detail, uploads });
    setCurrent(d);
    setUploads([]);
    setDirty(false);
    await refresh();
    return d;
  }
  async function act(action, detail) {
    await run(async () => {
      await save(action, detail);
      setPayment(null);
      setMessage(
        action === "paid"
          ? "Invoice marked paid and locked."
          : action === "issue"
            ? "Document issued and saved. You can still make corrections while unpaid."
            : "Record saved.",
      );
    });
  }
  async function pdf(mode) {
    await run(async () => {
      const d = dirty
        ? await save()
        : repository.cloud
          ? await repository.get(current.id)
          : current;
      if (repository.cloud) setCurrent(d);
      const { createInvoicePdf, download } = await import("./services/pdf.js");
      const blob = await createInvoicePdf(d, repository);
      if (mode === "download")
        download(blob, `${d.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
      else setPdfUrl(URL.createObjectURL(blob));
      setMessage("PDF ready. Attach the downloaded file to your email.");
    });
  }
  async function backup() {
    await run(async () => {
      const data = await repository.backup();
      const { download } = await import("./services/pdf.js");
      download(
        new Blob([JSON.stringify(data)], { type: "application/json" }),
        `high-amps-backup-${today()}.json`,
      );
      setMessage(
        "Backup downloaded with saved records, revision history and attachments. Unsaved edits are not included.",
      );
    });
  }
  async function restore(file) {
    if (!file) return;
    await run(async () => {
      const result = await repository.restore(JSON.parse(await file.text()));
      await refresh();
      setMessage(
        `Restored ${result.added} records. Skipped ${result.skipped} existing records; existing documents were not overwritten.`,
      );
    });
  }
  return (
    <>
      <header className="top">
        <Logo />
        <div className="top-actions">
          {user && (
            <button
              className="secondary dark"
              disabled={busy}
              onClick={leaveAccount}
            >
              Sign out
            </button>
          )}
          <button
            disabled={!ready || busy}
            className="secondary dark"
            onClick={() => newDoc("Quote")}
          >
            + New quote
          </button>
          <button disabled={!ready || busy} onClick={() => newDoc("Invoice")}>
            + New invoice
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav aria-label="Main navigation">
          <button
            disabled={busy}
            className={tab === "records" ? "active" : ""}
            onClick={() => {
              setTab("records");
              if (repository.cloud) run(refresh);
            }}
          >
            Invoice records
          </button>
          <button
            disabled={!current || busy}
            className={tab === "document" ? "active" : ""}
            onClick={() => setTab("document")}
          >
            Current document{dirty ? " •" : ""}
          </button>
          <button
            disabled={busy}
            className={tab === "backup" ? "active" : ""}
            onClick={() => setTab("backup")}
          >
            Backup & storage
          </button>
          <span className="version">
            {repository.cloud ? "CLOUD CONNECTED" : "LOCAL STORAGE"}
          </span>
        </nav>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}
        {busy && (
          <div className="notice" role="status">
            Working — please keep this page open…
          </div>
        )}
        {!ready ? (
          <section className="card empty">
            <h1>
              {error ? "Records could not be opened" : "Opening your records…"}
            </h1>
            {error && <button onClick={() => location.reload()}>Retry</button>}
          </section>
        ) : tab === "records" ? (
          <Records docs={docs} open={open} />
        ) : tab === "backup" ? (
          <main className="backup card">
            <p className="eyebrow">Protect your records</p>
            <h1>Backup & storage</h1>
            <p>
              {repository.cloud
                ? `Signed in as ${user.email}. Saved invoices and attachments are stored in your private Supabase account. Sign in with this same account on another device to access them. An internet connection is required to save changes.`
                : "Invoices and attachments are stored in this browser on this device. Cloud sync is not configured on this deployment. Clearing site data can remove local records."}
            </p>
            <p>
              Download regular backups and store them somewhere safe. Backups
              include saved documents, all retained attachments and revision
              history.
            </p>
            <div className="button-row">
              <button disabled={busy} onClick={backup}>
                Download full backup
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => restoreRef.current.click()}
              >
                Restore backup
              </button>
              <input
                hidden
                ref={restoreRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  restore(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="muted">
              Restore adds missing records and skips matching IDs or document
              numbers. It never replaces or unlocks existing paid records.
            </p>
            {repository.cloud && (
              <>
                <h2>Move your existing records to cloud</h2>
                <p>
                  On the browser where you created your old invoices, copy them
                  into this signed-in account. This includes saved attachments
                  and history. Local originals are retained, and existing cloud
                  records are skipped.
                </p>
                <button disabled={busy} onClick={importBrowser}>
                  Copy this browser’s records to cloud
                </button>
              </>
            )}
            <PastInvoiceImport onImport={importPastInvoice} disabled={busy} />
            <h2>Previous invoices</h2>
            <p>
              {repository.cloud
                ? "Use the copy button above on the original browser and website address to import Version 1 records. "
                : "Version 1 records migrate automatically on the same browser and website address. "}
              Previously downloaded PDFs that
              were never saved as records must be entered manually. Missing old
              uploads are flagged for re-upload.
            </p>
            <button
              disabled={busy}
              className="secondary"
              onClick={() =>
                run(async () => {
                  await refresh();
                  setMessage("Records refreshed.");
                })
              }
            >
              Refresh records
            </button>
          </main>
        ) : (
          current && (
            <main>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{current.type} workspace</p>
                  <h1>
                    {current.number}{" "}
                    <span className={`badge ${current.status.toLowerCase()}`}>
                      {current.status}
                    </span>
                  </h1>
                  <p className="muted">
                    {locked(current)
                      ? `${current.status} record · locked from editing`
                      : dirty
                        ? "Unsaved changes — save before leaving"
                        : repository.cloud
                          ? "Saved to your cloud account"
                          : "Saved on this device"}
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => pdf("view")}
                  >
                    View / print PDF
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => pdf("download")}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              {locked(current) && (
                <div className="notice">
                  This {current.status.toLowerCase()} document is read-only.{" "}
                  {current.status === "Paid"
                    ? "Payment recorded " +
                      (current.paidDate || "(legacy paid date unavailable)") +
                      ". No admin override is available."
                    : current.voidReason}
                </div>
              )}
              {!locked(current) && (
                <div className="action-bar">
                  <button disabled={busy} onClick={() => act()}>
                    Save changes
                  </button>
                  {current.status === "Draft" ? (
                    <button disabled={busy} onClick={() => act("issue")}>
                      Generate / issue {current.type.toLowerCase()}
                    </button>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => act("reopen")}
                      >
                        Reopen as draft
                      </button>
                      {current.type === "Invoice" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            setPayment({
                              paidDate: today(),
                              paymentMethod: "Zelle",
                              paymentReference: "",
                            })
                          }
                        >
                          Mark paid
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="quiet danger"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt(
                        "Reason for voiding this document? The record will be retained and locked.",
                      );
                      if (reason) act("void", { reason });
                    }}
                  >
                    Void
                  </button>
                  <span className="muted">
                    Unpaid invoices can be corrected and downloaded again.
                  </span>
                </div>
              )}
              <div className="document-grid">
                <Editor
                  doc={current}
                  update={update}
                  disabled={busy}
                  addFiles={addFiles}
                  removeFile={(id) => {
                    update({
                      attachments: current.attachments.filter(
                        (a) => a.id !== id,
                      ),
                    });
                    setUploads((list) => list.filter((a) => a.id !== id));
                  }}
                />
                <section className="preview-section">
                  <div className="preview-label">DOCUMENT PREVIEW</div>
                  <Preview doc={current} />
                  <section className="card history">
                    <h2>Record history</h2>
                    {current.history
                      .slice()
                      .reverse()
                      .map((h, i) => (
                        <p key={i}>
                          <strong>{h.action}</strong>
                          <small>
                            {new Date(h.at).toLocaleString()} · Revision{" "}
                            {h.version}
                            {h.reason ? ` · ${h.reason}` : ""}
                          </small>
                        </p>
                      ))}
                  </section>
                </section>
              </div>
            </main>
          )
        )}
        <footer>
          High-Amps Electrical Services ·{" "}
          {repository.cloud
            ? `Cloud account: ${user.email}`
            : "Records saved on this device"}{" "}
          ·{" "}
          <button className="quiet" onClick={() => setTab("backup")}>
            Back up your records
          </button>
        </footer>
      </div>
      {payment && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <h2 id="payment-title">Record full payment</h2>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <p>
              Marking this invoice paid saves your changes and locks the invoice
              and its attachments. This cannot be undone in Version 2.
            </p>
            <Field
              label="Paid date"
              type="date"
              max={today()}
              value={payment.paidDate}
              onChange={(v) => setPayment((p) => ({ ...p, paidDate: v }))}
            />
            <label>
              Payment method
              <select
                value={payment.paymentMethod}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, paymentMethod: e.target.value }))
                }
              >
                {[
                  "Zelle",
                  "Bank transfer",
                  "Cash",
                  "Check",
                  "Card",
                  "Other",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <Field
              label="Payment reference / note"
              value={payment.paymentReference}
              onChange={(v) =>
                setPayment((p) => ({ ...p, paymentReference: v }))
              }
            />
            <div className="button-row">
              <button disabled={busy} onClick={() => act("paid", payment)}>
                Confirm paid & lock
              </button>
              <button
                disabled={busy}
                className="secondary"
                onClick={() => setPayment(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
      {pdfUrl && (
        <div className="modal-backdrop">
          <section
            className="pdf-modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Print PDF"
          >
            <div className="section-heading">
              <p>
                Use the PDF viewer’s print control, or open it in a new tab.
              </p>
              <div className="button-row">
                <a
                  className="button"
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF
                </a>
                <button className="secondary" onClick={() => setPdfUrl("")}>
                  Close PDF
                </button>
              </div>
            </div>
            <iframe
              title="Invoice PDF — use viewer controls to print"
              src={pdfUrl}
            />
          </section>
        </div>
      )}
    </>
  );
}
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="card">
        <h1>Could not display the app</h1>
        <p>Your saved records have not been deleted. Reload to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <CloudAccess>
      {(props) => <App key={props.user?.id || "local"} {...props} />}
    </CloudAccess>
  </ErrorBoundary>,
);
