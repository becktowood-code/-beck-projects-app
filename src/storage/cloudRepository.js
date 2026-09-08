import {
  blankDocument,
  locked,
  transition,
  validate,
} from "../domain/invoice.js";
import { blobData } from "./repository.js";
const BUCKET = "high-amps-attachments";
function check(result) {
  if (result.error)
    throw new Error(
      result.error.message ||
        "Cloud request failed. Your changes were not saved.",
    );
  return result.data;
}
export class CloudInvoiceRepository {
  constructor(client, userId) {
    this.client = client;
    this.userId = userId;
    this.cloud = true;
  }
  async migrate() {
    /* Local records are imported only through an explicit user action. */
  }
  async all(table, columns = "*") {
    const rows = [];
    for (let start = 0; ; start += 500) {
      let query = this.client
          .from(table)
          .select(columns)
          .eq("owner_id", this.userId)
          .order(table === "ha_revisions" ? "document_id" : "id");
      if (table === "ha_revisions") query = query.order("version");
      const page = check(await query.range(start, start + 499));
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  async list() {
    return (await this.all("ha_documents", "id,document"))
      .map((r) => r.document)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id) {
    const row = check(
      await this.client
        .from("ha_documents")
        .select("document")
        .eq("owner_id", this.userId)
        .eq("id", id)
        .single(),
    );
    return row.document;
  }
  async create(type = "Invoice") {
    return check(
      await this.client.rpc("ha_create", {
        template: blankDocument("pending", type),
      }),
    );
  }
  async upload(documentId, { id, blob }) {
    if (!(blob instanceof Blob)) throw new Error("Invalid attachment.");
    const path = `${this.userId}/${documentId}/${id}`;
    const result = await this.client.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (result.error) {
      // Retrying a failed save may encounter its own already-uploaded immutable object.
      if (!/already exists|duplicate/i.test(result.error.message))
        throw new Error(`Could not upload attachment: ${result.error.message}`);
      const existing = check(
        await this.client.storage.from(BUCKET).download(path),
      );
      const hash = async (b) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await b.arrayBuffer()),
          ),
        ).join(",");
      if ((await hash(existing)) !== (await hash(blob)))
        throw new Error(
          "An attachment ID already contains a different file. Remove it and upload again.",
        );
    }
  }
  async save(doc, { action = "save", detail = {}, uploads = [] } = {}) {
    if (locked(doc)) throw new Error("Paid and void documents are locked.");
    const candidate = action === "save" ? doc : transition(doc, action, detail);
    validate(candidate, ["Issued", "Paid"].includes(candidate.status));
    // Check concurrency before spending bandwidth; the RPC checks again under a row lock.
    const existing = await this.get(doc.id);
    if (locked(existing))
      throw new Error("Paid and void documents are locked.");
    if (existing.version !== doc.version)
      throw new Error(
        "This record changed on another device. Reload it before editing.",
      );
    for (const upload of uploads) await this.upload(doc.id, upload);
    return check(
      await this.client.rpc("ha_save", { candidate: doc, action, detail }),
    );
  }
  async attachment(id) {
    const row = check(
      await this.client
        .from("ha_files")
        .select("path,document_id")
        .eq("owner_id", this.userId)
        .eq("id", id)
        .single(),
    );
    const blob = check(
      await this.client.storage.from(BUCKET).download(row.path),
    );
    return { id, documentId: row.document_id, blob };
  }
  async backup() {
    const [documents, files, history] = await Promise.all([
      this.list(),
      this.all("ha_files"),
      this.all("ha_revisions"),
    ]);
    const attachments = [];
    for (const f of files) {
      const blob = check(
        await this.client.storage.from(BUCKET).download(f.path),
      );
      attachments.push({
        id: f.id,
        documentId: f.document_id,
        data: await blobData(blob),
      });
    }
    return {
      format: "high-amps-backup",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      documents,
      attachments,
      revisions: history.map((r) => ({
        key: `${r.document_id}:${r.version}`,
        document: r.document,
      })),
    };
  }
  async restore(backup) {
    if (
      backup?.format !== "high-amps-backup" ||
      backup.schemaVersion !== 1 ||
      !Array.isArray(backup.documents) ||
      !Array.isArray(backup.attachments)
    )
      throw new Error("Choose a High-Amps backup file.");
    const files = new Map();
    for (const f of backup.attachments) {
      if (
        typeof f.data !== "string" ||
        !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(f.data)
      )
        throw new Error("Backup contains an unsupported attachment.");
      files.set(f.id, f);
    }
    for (const d of backup.documents) {
      validate(d);
      if (
        !Array.isArray(d.attachments) ||
        !Array.isArray(d.history) ||
        !Number.isInteger(d.version) ||
        d.version < 1
      )
        throw new Error("Invalid backup record.");
      for (const a of d.attachments)
        if (!a.missing && files.get(a.id)?.documentId !== d.id)
          throw new Error(`Backup has missing attachment: ${a.name}`);
    }
    const existing = await this.list(),
      ids = new Set(existing.map((d) => d.id)),
      numbers = new Set(existing.map((d) => d.number));
    let added = 0,
      skipped = 0;
    for (const d of backup.documents) {
      if (ids.has(d.id) || numbers.has(d.number.trim())) {
        skipped++;
        continue;
      }
      try {
        const extras = backup.attachments.filter((f) => f.documentId === d.id);
        for (const f of extras) {
          const blob = await (await fetch(f.data)).blob();
          await this.upload(d.id, { id: f.id, blob });
        }
        const imported = check(
          await this.client.rpc("ha_import", {
            doc: d,
            files: extras.map((f) => ({ id: f.id })),
            revisions: (backup.revisions || []).filter(
              (r) => r.document?.id === d.id,
            ),
          }),
        );
        if (imported) {
          added++;
          ids.add(d.id);
          numbers.add(d.number.trim());
        } else skipped++;
      } catch (e) {
        throw new Error(
          `Import stopped at ${d.number}. ${added} records imported, ${skipped} skipped. Originals are unchanged; retry safely. ${e.message}`,
        );
      }
    }
    return { added, skipped };
  }
}
