/** Recurring rules for a ledger (templates that generate transactions). */
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { RecurringRule } from "../domain/types";

const col = (ledgerId: string) => collection(db, "ledgers", ledgerId, "recurring");

/** Fields the form provides; the repo adds nextDate/active/timestamps. */
export type RecurringInput = Omit<RecurringRule, "id" | "nextDate" | "active">;

function toRule(s: QueryDocumentSnapshot<DocumentData>): RecurringRule {
  const d = s.data();
  return {
    id: s.id,
    type: d.type,
    amount: d.amount,
    currency: d.currency,
    baseAmount: d.baseAmount,
    baseCurrency: d.baseCurrency,
    fxRate: d.fxRate,
    categoryId: d.categoryId ?? null,
    accountId: d.accountId,
    toAccountId: d.toAccountId ?? null,
    title: d.title,
    note: d.note ?? null,
    frequency: d.frequency,
    interval: d.interval ?? 1,
    startDate: (d.startDate as Timestamp).toDate(),
    nextDate: (d.nextDate as Timestamp).toDate(),
    active: d.active ?? true,
  };
}

export const recurringRepo = {
  async fetchActive(ledgerId: string): Promise<RecurringRule[]> {
    const snap = await getDocs(query(col(ledgerId), where("active", "==", true)));
    return snap.docs.map(toRule);
  },

  subscribe(ledgerId: string, cb: (rules: RecurringRule[]) => void): Unsubscribe {
    return onSnapshot(
      col(ledgerId),
      (s) => cb(s.docs.map(toRule).sort((a, b) => a.title.localeCompare(b.title))),
      (e) => console.error("recurring", e),
    );
  },

  add(ledgerId: string, input: RecurringInput) {
    return addDoc(col(ledgerId), {
      ...input,
      startDate: Timestamp.fromDate(input.startDate),
      nextDate: Timestamp.fromDate(input.startDate),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  update(ledgerId: string, id: string, patch: Partial<RecurringRule>) {
    const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    if (patch.startDate) data.startDate = Timestamp.fromDate(patch.startDate);
    if (patch.nextDate) data.nextDate = Timestamp.fromDate(patch.nextDate);
    return updateDoc(doc(col(ledgerId), id), data);
  },

  remove(ledgerId: string, id: string) {
    return deleteDoc(doc(col(ledgerId), id));
  },
};
