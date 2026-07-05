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

type Row = Record<string, unknown>;

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

export interface Backup {
  version: number;
  exportedAt: string;
  accounts: Row[];
  categories: Row[];
  transactions: Row[];
  recurring: Row[];
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

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Human-readable transactions CSV (amounts in major units, names resolved). */
export function backupToCsv(b: Backup): string {
  const catName = new Map(b.categories.map((c) => [c.id as string, c.name as string]));
  const accName = new Map(b.accounts.map((a) => [a.id as string, a.name as string]));
  const header = ["Date", "Type", "Title", "Category", "Account", "ToAccount", "Amount", "Currency", "Note"];
  const rows = [...b.transactions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((t) => [
      String(t.date ?? "").slice(0, 10),
      t.type,
      t.title ?? "",
      catName.get(t.categoryId as string) ?? "",
      accName.get(t.accountId as string) ?? "",
      accName.get(t.toAccountId as string) ?? "",
      (Number(t.amount) / 100).toFixed(2),
      t.currency,
      t.note ?? "",
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
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
