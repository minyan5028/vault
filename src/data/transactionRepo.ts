/**
 * The thin persistence seam for Financial Events. All Firestore access for
 * transactions goes through here, scoped by `ledgerId` (never a hardcoded
 * ledger — Phase 2 sharing depends on this). Keeps Firestore out of the rest
 * of the app.
 */
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { yearMonthOf } from "../lib/date";
import type { EventType, Transaction } from "../domain/types";

/** Fields the caller provides; server-managed fields are added by the repo. */
export interface NewTransactionInput {
  type: EventType;
  amount: number; // minor units (×100)
  currency: string;
  baseAmount: number; // minor units (×100)
  baseCurrency: string;
  fxRate: number;
  date: Date;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  title: string;
  note: string | null;
  createdBy: string;
}

/** What Quick Entry produces; the repo/caller adds `createdBy`. */
export type EntryDraft = Omit<NewTransactionInput, "createdBy">;

function transactionsCol(ledgerId: string) {
  return collection(db, "ledgers", ledgerId, "transactions");
}

function fromSnapshot(snap: QueryDocumentSnapshot<DocumentData>): Transaction {
  const d = snap.data();
  return {
    id: snap.id,
    type: d.type,
    amount: d.amount,
    currency: d.currency,
    baseAmount: d.baseAmount,
    baseCurrency: d.baseCurrency,
    fxRate: d.fxRate,
    date: (d.date as Timestamp).toDate(),
    yearMonth: d.yearMonth,
    categoryId: d.categoryId ?? null,
    accountId: d.accountId,
    toAccountId: d.toAccountId ?? null,
    title: d.title,
    note: d.note ?? null,
    createdBy: d.createdBy,
    createdAt: (d.createdAt as Timestamp | null)?.toDate() ?? new Date(),
    updatedAt: (d.updatedAt as Timestamp | null)?.toDate() ?? new Date(),
    deletedAt: (d.deletedAt as Timestamp | null)?.toDate() ?? null,
    source: d.source ?? null,
  };
}

/** Map docs → Transactions, drop soft-deleted, newest first. */
function sortActive(docs: QueryDocumentSnapshot<DocumentData>[]): Transaction[] {
  return docs
    .map(fromSnapshot)
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export const transactionRepo = {
  /** Record a Financial Event. Returns the new document id. */
  async add(ledgerId: string, input: NewTransactionInput): Promise<string> {
    const ref = await addDoc(transactionsCol(ledgerId), {
      ...input,
      date: Timestamp.fromDate(input.date),
      yearMonth: yearMonthOf(input.date),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null,
    });
    return ref.id;
  },

  /** This-month Timeline: not deleted, newest first. */
  async listByMonth(ledgerId: string, yearMonth: string): Promise<Transaction[]> {
    const q = query(
      transactionsCol(ledgerId),
      where("yearMonth", "==", yearMonth),
      where("deletedAt", "==", null),
      orderBy("date", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map(fromSnapshot);
  },

  /** One-shot fetch for a month (prefers server when online). */
  async fetchMonth(ledgerId: string, yearMonth: string): Promise<Transaction[]> {
    const q = query(transactionsCol(ledgerId), where("yearMonth", "==", yearMonth));
    return sortActive((await getDocs(q)).docs);
  },

  /**
   * Live subscription to a month, updating on every change (and offline via the
   * local cache). Uses an equality-only query so no composite index is needed
   * yet; sorting and the deletedAt filter are applied client-side (month volume
   * is small). Returns an unsubscribe function.
   */
  subscribeByMonth(
    ledgerId: string,
    yearMonth: string,
    cb: (txns: Transaction[]) => void,
  ): Unsubscribe {
    const q = query(transactionsCol(ledgerId), where("yearMonth", "==", yearMonth));
    return onSnapshot(
      q,
      (snap) => cb(sortActive(snap.docs)),
      (err) => console.error("subscribeByMonth", err),
    );
  },

  /** Edit in place (loose event model): update fields and bump updatedAt. */
  async update(
    ledgerId: string,
    id: string,
    patch: Partial<NewTransactionInput>,
  ): Promise<void> {
    const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    if (patch.date) {
      data.date = Timestamp.fromDate(patch.date);
      data.yearMonth = yearMonthOf(patch.date);
    }
    await updateDoc(doc(transactionsCol(ledgerId), id), data);
  },

  /** Soft delete (ADR-0004): sets deletedAt; excluded from all queries. */
  async softDelete(ledgerId: string, id: string): Promise<void> {
    await updateDoc(doc(transactionsCol(ledgerId), id), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  /** Undo a soft delete: clears deletedAt so it reappears in queries. */
  async restore(ledgerId: string, id: string): Promise<void> {
    await updateDoc(doc(transactionsCol(ledgerId), id), {
      deletedAt: null,
      updatedAt: serverTimestamp(),
    });
  },
};
