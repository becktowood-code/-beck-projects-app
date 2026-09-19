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

Vercel: use the Vite framework preset, `npm run build`, and output directory `dist`. Keep the existing production domain to retain access to browser-local Version 1 data. Configure Supabase as described below to enable cloud login and records.

## Supabase cloud setup

1. Create a free Supabase project. Run `supabase/migrations/202609070001_cloud_records.sql` as the database owner, using the SQL editor or migrations CLI. The application tables use Row Level Security and private attachment storage.
2. In Supabase Authentication → URL Configuration, set Site URL to your Vercel app URL. Email confirmation and recovery redirect to that origin. Only add exact trusted development/preview URLs when needed.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel and redeploy. For local development, copy `.env.example` to `.env.local`. These are public client settings: never use the database password, a secret key or a service-role key in a Vite variable.
4. Open the app, create your invoice-app account, confirm its email, and use that same account on each device. This is a separate account from the Supabase administration dashboard. The default Supabase email service supports project-team email addresses only, with limited sends; custom SMTP is needed for other users. Email verification remains enabled.
5. On the original browser, sign in and choose Backup & storage → Copy this browser’s records to cloud. Saved attachments and revisions are included, and local originals remain unchanged. Matching cloud document IDs/numbers are skipped; no paid record is overwritten. Imports commit per document and report partial progress if interrupted, so they can be retried safely.

With cloud configuration enabled, the app requires login and saves directly to Supabase. It refreshes records when the window regains focus, reconnects, or opens the records tab. It never silently falls back to local storage on cloud errors. Concurrent edits are rejected on the server. Each account has its own invoice numbering and private records; sharing one workspace across different user accounts is not implemented.

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

Download full backups regularly under Backup & storage. They contain saved metadata, revision snapshots and attachment bytes. Restore skips matching IDs/numbers and never overwrites or unlocks existing paid records. Local restore is atomic; cloud restore commits per document and reports progress if interrupted. Backups contain private customer and business information.

Without Supabase configuration, the app retains its local mode. IndexedDB separates `documents`, `attachments` (Blobs), `revisions` and `settings`. A cleared browser profile or lost device can remove local data. Invoice/attachment payloads are never written to localStorage; Supabase uses browser storage for its authenticated session. File selection remains pending until Save/Issue/Mark paid succeeds. Failed writes are shown rather than reported as saved. Uploads are limited to 30 MB each; PNG, JPEG, WebP and unencrypted PDF are supported. Malformed/protected PDFs produce a named error instead of an incomplete download. PDF characters outside the standard Latin font are replaced with `?`; original record text is preserved.

Version 1 `bp_docs` and counters migrate once, transactionally, on the same origin. The original localStorage keys are not modified. Previously stripped attachment placeholders are visibly marked missing. Re-upload or exclude them before generating a complete PDF. Old downloaded invoices not present in `bp_docs` cannot be discovered automatically; enter them manually. If legacy data is malformed/has duplicate numbers, migration stops without deleting it so it can be repaired/exported.

## Architecture

- `src/domain/invoice.js`: calculation in cents, input validation, allowed transitions, filtering and CSV.
- `src/storage/repository.js`: async storage boundary, transactions, optimistic version checks, payment locks, migration, backup/restore and revision snapshots.
- `src/storage/cloudRepository.js`: authenticated Supabase adapter, immutable attachment uploads, cloud import/export and conflict checks.
- `src/components/CloudAccess.jsx`: login, account creation, session handling and password recovery.
- `supabase/migrations/`: owner-scoped database functions, server-side lifecycle checks and private file policies.
- `src/components/`: editor, records and document preview.
- `src/services/pdf.js`: lazily loaded PDF creation; one full page per attachment image/PDF source page.
- `src/main.jsx`: application navigation and workflows, visible persistence errors and unsaved-change protection.
- `tests/invoice.test.js`: lifecycle, money, migration, storage, conflict, CSV and restore tests.

Cloud writes use authenticated database functions with an explicit owner check and row locking. Direct client updates/deletes are denied. Paid/void records and uploaded object keys are immutable through the app and public API. Database owners retain administrative powers; this is not a certified accounting archive. Files from previous revisions are retained. If an upload succeeds but the record save fails, its immutable staged object may remain; retry reuses identical bytes. Account storage is subject to the Supabase free-plan quotas, and an administrator can review unused staged files if needed.

Browser workflow verification (Chromium):

```sh
npx playwright install chromium
npm run test:e2e
```

This checks issuing, correcting, reopening, PDF download with oversized image and two PDF attachment pages, paid locking, reload persistence, mobile layout, search and backup/restore. The test starts a local server automatically when needed.

## Itemized billing

Invoices and quotes list every labor/fixed-cost line, then Labor Total, followed by each manual material and charged receipt. Each section includes its applicable sales tax; Total equals Labor Total + Materials Total. Existing customer/contractor tax rules, markup, payment balances and saved records remain supported. Material entries and receipts support descriptions and optional source/supplier names. Receipt amounts marked tax-inclusive are not taxed twice. Enter a purchase as manual items or a receipt amount, not both; attachments with no amount remain supporting documents. Preview and downloaded PDFs use the same cents-based breakdown.
