# High-Amps Electrical Services — Version 2

A mobile-friendly invoice and quote app built with React and Vite. The original repository logo, business contact details, $150 hourly rate, 7% sales-tax default, due-on-receipt terms and payment instructions are preserved. Each document snapshots business defaults so future default changes do not change old records.

## Run and verify

Requires Node 22.12 or newer.

```sh
npm ci
npm test
npm run build
npm run dev
```

Vercel: import this repository, use the Vite framework preset, `npm run build`, and output directory `dist`. `vercel.json` includes these settings. No server environment variables are required. Use the existing production domain to retain access to browser-local Version 1 data.

## Workflow

1. New Invoice creates a persistent Draft and allocates a unique HA number.
2. Enter customer and/or contractor details and select who receives the bill. Add labor, materials (including markup), fixed costs and attachments. Save changes explicitly. Unsaved edits are labeled and leaving/reloading prompts before discarding them.
3. Generate / issue validates recipient and amounts and saves the Issued record. Issued means finalized; the app does not send email or claim delivery.
4. Correct any unpaid invoice with Save changes, or Reopen as draft, correct it and issue again. The number stays the same and saved revisions are retained.
5. Download PDF, or View / print PDF and use the viewer's print control. Send the downloaded PDF using your email app. Images and each attached PDF page are scaled within a separate Letter page, preserving aspect ratio. Text invoices paginate; PDFs are not screen captures.
6. Mark paid, enter the paid date/method/reference and confirm. This records full payment and locks all edits, attachment changes, voiding and reopening. There is no admin override. Quotes cannot be marked paid.
7. Void cancels an unpaid document with a reason and retains a locked record. There is no delete button.

## Records and backups

Records support search by number, customer, contractor, project and address; type/status filters; and year filtering by invoice date or paid date. CSV exports include dates, recipients, subtotal, tax, total, paid amount, balance and payment details. Summary totals exclude drafts, voids and quotes. The displayed Received total includes fully paid invoices; legacy partial payments remain in individual documents/CSV. Paid legacy records without a known date are not guessed and do not appear under a specific payment year. These are bookkeeping summaries, not a tax filing calculation.

Download full backups regularly under Backup & storage. They contain saved metadata, revision snapshots and attachment bytes. Restore adds missing documents atomically and skips matching IDs/numbers; it does not overwrite or unlock existing paid records. Backups contain private customer and business information.

**Storage is still local to this browser, device and website origin. There is no cloud sync or login.** IndexedDB separates `documents`, `attachments` (Blobs), `revisions` and `settings`. The app requests persistent browser storage when supported, but a cleared browser profile or lost device can still remove data. No invoice or attachment payload is written to localStorage. File selection is pending until Save/Issue/Mark paid succeeds. Failed writes are shown rather than reported as saved. Individual uploads are limited to 30 MB; PNG, JPEG, WebP and unencrypted PDF are supported. Password-protected or malformed PDFs produce a named error, never a silently incomplete download. Uncommon characters outside the PDF standard Latin font are replaced with `?` in PDF output; original record text is preserved.

Version 1 `bp_docs` and counters migrate once, transactionally, on the same origin. The original localStorage keys are not modified. Previously stripped attachment placeholders are visibly marked missing. Re-upload or exclude them before generating a complete PDF. Old downloaded invoices not present in `bp_docs` cannot be discovered automatically; enter them manually. If legacy data is malformed/has duplicate numbers, migration stops without deleting it so it can be repaired/exported.

## Architecture

- `src/domain/invoice.js`: calculation in cents, input validation, allowed transitions, filtering and CSV.
- `src/storage/repository.js`: async storage boundary, transactions, optimistic version checks, payment locks, migration, backup/restore and revision snapshots.
- `src/components/`: editor, records and document preview.
- `src/services/pdf.js`: lazily loaded PDF creation; one full page per attachment image/PDF source page.
- `src/main.jsx`: application navigation and workflows, visible persistence errors and unsaved-change protection.
- `tests/invoice.test.js`: lifecycle, money, migration, storage, conflict, CSV and restore tests.

To add cloud storage, replace the repository adapter with an authenticated API and object storage. Enforce version conflicts and paid/void locks on the server, retain revision snapshots, and make invoice numbering atomic per business. Browser locks prevent accidental app edits, not tampering by someone with developer tools. Do not treat this local app as a multi-user security boundary or an immutable accounting archive.

Browser workflow verification (Chromium):

```sh
npx playwright install chromium
npm run test:e2e
```

This checks issuing, correcting, reopening, PDF download with oversized image and two PDF attachment pages, paid locking, reload persistence, mobile layout, search and backup/restore. The test starts a local server automatically when needed.
