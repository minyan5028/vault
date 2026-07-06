/**
 * Backup: export the whole ledger (accounts, categories, transactions,
 * recurring) to JSON or CSV, and restore a JSON backup. Delivers the
 * "own your data" principle (PHILOSOPHY / README).
 */
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Backup, Row } from "../lib/backupCsv";

export type { Backup } from "../lib/backupCsv";
export { backupToCsv } from "../lib/backupCsv";

const sub = (ledgerId: string, name: string): CollectionReference =>
  collection(db, "ledgers", ledgerId, name);

// Fields stored as Firestore Timestamps across the collections.
const TS_FIELDS = ["date", "createdAt", "updatedAt", "deletedAt", "startDate", "nextDate"];

function tsToIso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}
function isoToTs(v: unknown): Timestamp | null {
  return typeof v === "string" && v ? Timestamp.fromDate(new Date(v)) : null;
}

async function readAll(ledgerId: string, name: string, activeOnly = false): Promise<Row[]> {
  const q = activeOnly
    ? query(sub(ledgerId, name), where("deletedAt", "==", null))
    : query(sub(ledgerId, name));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data: Row = { id: d.id, ...d.data() };
    for (const f of TS_FIELDS) if (f in data) data[f] = tsToIso(data[f]);
    return data;
  });
}

/** Read the whole ledger into a plain, JSON-serializable backup object. */
export async function buildBackup(ledgerId: string): Promise<Backup> {
  const [accounts, categories, transactions, recurring] = await Promise.all([
    readAll(ledgerId, "accounts"),
    readAll(ledgerId, "categories"),
    readAll(ledgerId, "transactions", true),
    readAll(ledgerId, "recurring"),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), accounts, categories, transactions, recurring };
}

/** Restore a JSON backup (upsert by id — re-importing the same file is safe). */
export async function importBackup(ledgerId: string, b: Backup): Promise<Record<string, number>> {
  async function writeAll(name: string, items: Row[] = []): Promise<number> {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      for (const it of items.slice(i, i + 400)) {
        const { id, ...rest } = it;
        const data: Row = { ...rest };
        for (const f of TS_FIELDS) if (f in data) data[f] = isoToTs(data[f]);
        batch.set(doc(sub(ledgerId, name), String(id)), data, { merge: true });
      }
      await batch.commit();
    }
    return items.length;
  }
  return {
    accounts: await writeAll("accounts", b.accounts),
    categories: await writeAll("categories", b.categories),
    transactions: await writeAll("transactions", b.transactions),
    recurring: await writeAll("recurring", b.recurring),
  };
}
