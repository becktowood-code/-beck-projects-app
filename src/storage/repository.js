import { openDB } from "idb";
import {
  blankDocument,
  calculate,
  locked,
  transition,
  validate,
} from "../domain/invoice.js";

// Adapter boundary: a future cloud implementation must enforce the same checks on its server.
export class InvoiceRepository {
  constructor(name = "high-amps-v2") {
    this.name = name;
  }
  async db() {
    this.connection ||= openDB(this.name, 1, {
      upgrade(db) {
        const docs = db.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("number", "number", { unique: true });
        db.createObjectStore("attachments", { keyPath: "id" });
        db.createObjectStore("revisions", { keyPath: "key" });
        db.createObjectStore("settings");
      },
    });
    return this.connection;
  }
  async list() {
    return (await (await this.db()).getAll("documents")).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async get(id) {
    return (await this.db()).get("documents", id);
  }
  async attachment(id) {
    return (await this.db()).get("attachments", id);
  }
  async create(type = "Invoice") {
    const db = await this.db(),
      tx = db.transaction(["documents", "settings"], "readwrite");
    let count = Number(await tx.objectStore("settings").get("counter")) || 1;
    let number;
    do {
      number = `HA-${String(count++).padStart(4, "0")}`;
    } while (await tx.objectStore("documents").index("number").get(number));
    const doc = blankDocument(number, type);
    doc.version = 1;
    doc.updatedAt = doc.createdAt;
    doc.history = [{ at: doc.createdAt, action: "Created", version: 1 }];
    await tx.objectStore("documents").add(doc);
    await tx.objectStore("settings").put(count, "counter");
    await tx.done;
    return doc;
  }
  async save(doc, { action = "save", detail = {}, uploads = [] } = {}) {
    validate(doc);
    const db = await this.db(),
      tx = db.transaction(
        ["documents", "attachments", "revisions"],
        "readwrite",
      );
    try {
      const store = tx.objectStore("documents"),
        existing = await store.get(doc.id);
      if (!existing)
        throw new Error("Document no longer exists. Reload records.");
      if (locked(existing))
        throw new Error(`${existing.status} documents are locked.`);
      if (existing.version !== doc.version)
        throw new Error(
          "This record changed in another tab. Reload records before editing. Your changes have not been saved.",
        );
      if (doc.status !== existing.status || doc.type !== existing.type)
        throw new Error("Use the lifecycle actions to change status.");
      let next =
        action === "save"
          ? structuredClone(doc)
          : transition(doc, action, detail);
      if (next.status === "Issued" || next.status === "Paid")
        validate(next, true);
      next.number = next.number.trim();
      const other = await store.index("number").get(next.number);
      if (other && other.id !== next.id)
        throw new Error("That document number is already in use.");
      // Payment/audit fields cannot be rewritten through the editor.
      next.createdAt = existing.createdAt;
      next.issuedAt = existing.issuedAt || next.issuedAt;
      next.payments = existing.payments || [];
      if (action !== "paid") {
        next.paidDate = existing.paidDate;
        next.paymentMethod = existing.paymentMethod;
        next.paymentReference = existing.paymentReference;
      }
      next.updatedAt = new Date().toISOString();
      next.version = existing.version + 1;
      next.history = [
        ...existing.history,
        {
          at: next.updatedAt,
          action:
            action === "save"
              ? "Saved corrections"
              : {
                  issue: "Issued",
                  reopen: "Reopened for corrections",
                  paid: "Marked paid",
                  void: "Voided",
                }[action],
          version: next.version,
          ...detail,
        },
      ];
      for (const upload of uploads) {
        if (!(upload.blob instanceof Blob))
          throw new Error("Invalid attachment.");
        await tx
          .objectStore("attachments")
          .put({ ...upload, documentId: next.id });
      }
      for (const item of next.attachments) {
        if (item.missing) continue;
        const stored = await tx.objectStore("attachments").get(item.id);
        if (!stored || stored.documentId !== next.id)
          throw new Error(`Missing attachment: ${item.name}`);
      }
      await tx
        .objectStore("revisions")
        .put({ key: `${existing.id}:${existing.version}`, document: existing });
      await store.put(next);
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already have aborted on quota failure. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async migrate(storage = localStorage) {
    const db = await this.db();
    if (await db.get("settings", "legacyMigrated")) return;
    const raw = storage.getItem("bp_docs");
    const legacy = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(legacy))
      throw new Error(
        "Old records could not be read. Original browser data has been preserved.",
      );
    const migrated = [],
      blobs = [];
    for (const old of legacy) {
      const doc = {
        ...blankDocument(old.number || `LEGACY-${crypto.randomUUID()}`),
        ...old,
        attachments: [],
        version: 1,
      };
      doc.status = /^(paid|fully paid)$/i.test(String(old.status).trim())
        ? "Paid"
        : /void/i.test(old.status)
          ? "Void"
          : /sent|issued|generated|final/i.test(old.status)
            ? "Issued"
            : "Draft";
      doc.legacyStatus = old.status;
      doc.updatedAt = new Date().toISOString();
      doc.history = [
        { at: doc.updatedAt, action: "Imported from Version 1", version: 1 },
      ];
      for (const [key, category] of [
        ["photos", "Photo"],
        ["files", "Receipt / material list"],
      ]) {
        for (const file of old[key] || []) {
          const id = crypto.randomUUID();
          const meta = {
            id,
            name: file.name || "Legacy attachment",
            type: file.type || "",
            category,
            showOnInvoice: file.showOnInvoice !== false,
            missing: !file.data,
          };
          if (file.data) {
            const blob = await (await fetch(file.data)).blob();
            blobs.push({ id, documentId: doc.id, blob });
          }
          doc.attachments.push(meta);
        }
      }
      delete doc.photos;
      delete doc.files;
      validate(doc);
      migrated.push(doc);
    }
    const tx = db.transaction(
      ["documents", "attachments", "settings"],
      "readwrite",
    );
    try {
      for (const doc of migrated)
        if (!(await tx.objectStore("documents").get(doc.id)))
          await tx.objectStore("documents").add(doc);
      for (const blob of blobs) await tx.objectStore("attachments").put(blob);
      await tx
        .objectStore("settings")
        .put(
          Math.max(
            Number(storage.getItem("ha_counter")) || 1,
            Number(storage.getItem("bp_counter")) || 1,
          ),
          "counter",
        );
      await tx.objectStore("settings").put(true, "legacyMigrated");
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already have aborted on quota failure. */
      }
      await tx.done.catch(() => {});
      throw new Error(
        `Migration failed; original data is unchanged. ${error.message}`,
      );
    }
  }
  async backup() {
    const db = await this.db(),
      tx = db.transaction(
        ["documents", "attachments", "revisions"],
        "readonly",
      );
    const [documents, attachments, revisions] = await Promise.all([
      tx.objectStore("documents").getAll(),
      tx.objectStore("attachments").getAll(),
      tx.objectStore("revisions").getAll(),
    ]);
    await tx.done;
    const files = await Promise.all(
      attachments.map(async ({ blob, ...meta }) => ({
        ...meta,
        data: await blobData(blob),
      })),
    );
    return {
      format: "high-amps-backup",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      documents,
      attachments: files,
      revisions,
    };
  }
  async restore(backup) {
    if (
      backup.format !== "high-amps-backup" ||
      backup.schemaVersion !== 1 ||
      !Array.isArray(backup.documents) ||
      !Array.isArray(backup.attachments)
    )
      throw new Error("Choose a High-Amps Version 2 backup file.");
    const blobs = new Map();
    for (const f of backup.attachments) {
      if (typeof f.data !== "string" || !f.data.startsWith("data:"))
        throw new Error("Invalid backup attachment.");
      blobs.set(f.id, {
        id: f.id,
        documentId: f.documentId,
        blob: await (await fetch(f.data)).blob(),
      });
    }
    for (const d of backup.documents) {
      validate(d);
      if (
        !Array.isArray(d.attachments) ||
        !Array.isArray(d.history) ||
        !Number.isInteger(d.version) ||
        d.version < 1 ||
        !d.updatedAt
      )
        throw new Error("Invalid backup record.");
      for (const a of d.attachments)
        if (!a.missing && blobs.get(a.id)?.documentId !== d.id)
          throw new Error("Backup has missing attachments.");
    }
    const db = await this.db(),
      tx = db.transaction(
        ["documents", "attachments", "revisions"],
        "readwrite",
      );
    let added = 0,
      skipped = 0;
    try {
      const accepted = new Set();
      for (const d of backup.documents) {
        if (
          (await tx.objectStore("documents").get(d.id)) ||
          (await tx.objectStore("documents").index("number").get(d.number))
        ) {
          skipped++;
          continue;
        }
        await tx.objectStore("documents").add(d);
        accepted.add(d.id);
        added++;
      }
      for (const f of blobs.values())
        if (accepted.has(f.documentId))
          await tx.objectStore("attachments").add(f);
      for (const r of backup.revisions || [])
        if (accepted.has(r.document?.id))
          await tx.objectStore("revisions").add(r);
      await tx.done;
      return { added, skipped };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already have aborted on quota failure. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
export const blobData = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
export const repository = new InvoiceRepository();
