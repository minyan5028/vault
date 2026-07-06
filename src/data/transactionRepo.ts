/**
 * The thin persistence seam for Financial Events, scoped by `ledgerId`.
 *
 * Every write also maintains a per-account balance rollup at
 * `ledgers/{id}/meta/balances` ({ netFlow: { accountId: minorUnits } }) via
 * atomic increments, so the Assets page reads one doc instead of every
 * transaction. Edits/deletes read the old doc in a transaction to reverse its
 * effect. See recomputeBalances for the one-time backfill / repair.
 */
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { yearMonthOf } from "../lib/date";
import type { EventType, Transaction } from "../domain/types";

export interface NewTransactionInput {
  type: EventType;
  amount: number;
  currency: string;
  baseAmount: number;
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

export interface TitleSuggestion {
  title: string;
  type: EventType;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
}

const transactionsCol = (ledgerId: string) => collection(db, "ledgers", ledgerId, "transactions");
const rollupRef = (ledgerId: string) => doc(db, "ledgers", ledgerId, "meta", "balances");

const cmpDesc = (a: Transaction, b: Transaction) =>
  b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/** Signed effect on each account's balance (minor units), scaled by `sign`. */
function accountDeltas(
  t: { type: EventType; accountId: string; toAccountId: string | null; baseAmount: number },
  sign: 1 | -1,
): Record<string, number> {
  const d: Record<string, number> = {};
  const add = (acc: string | null, v: number) => {
    if (acc) d[acc] = (d[acc] ?? 0) + v * sign;
  };
  if (t.type === "income") add(t.accountId, t.baseAmount);
  else if (t.type === "expense") add(t.accountId, -t.baseAmount);
  else if (t.type === "transfer") {
    add(t.accountId, -t.baseAmount);
    add(t.toAccountId, t.baseAmount);
  }
  return d;
}

/** A set-merge payload that atomically increments the rollup's netFlow map. */
function rollupDelta(deltas: Record<string, number>) {
  const netFlow: Record<string, unknown> = {};
  for (const [acc, v] of Object.entries(deltas)) if (v !== 0) netFlow[acc] = increment(v);
  return { netFlow };
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

function sortActive(docs: QueryDocumentSnapshot<DocumentData>[]): Transaction[] {
  return docs
    .map(fromSnapshot)
    .filter((t) => t.deletedAt === null)
    .sort(cmpDesc);
}

export const transactionRepo = {
  /** Record a Financial Event and bump the rollup. Returns the new id. */
  async add(ledgerId: string, input: NewTransactionInput): Promise<string> {
    const ref = doc(transactionsCol(ledgerId));
    const batch = writeBatch(db);
    batch.set(ref, {
      ...input,
      date: Timestamp.fromDate(input.date),
      yearMonth: yearMonthOf(input.date),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null,
    });
    batch.set(rollupRef(ledgerId), rollupDelta(accountDeltas(input, 1)), { merge: true });
    await batch.commit();
    return ref.id;
  },

  /** This-month Timeline: not deleted, newest first (composite-index free query). */
  async fetchMonth(ledgerId: string, yearMonth: string): Promise<Transaction[]> {
    const q = query(transactionsCol(ledgerId), where("yearMonth", "==", yearMonth));
    return sortActive((await getDocs(q)).docs);
  },

  /** Live subscription to a month (offline-capable; sort/filter client-side). */
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

  /** Live subscription to one account's full history (as source or destination). */
  subscribeByAccount(
    ledgerId: string,
    accountId: string,
    cb: (txns: Transaction[]) => void,
  ): Unsubscribe {
    let fromA: Transaction[] = [];
    let fromB: Transaction[] = [];
    const emit = () => {
      const m = new Map<string, Transaction>();
      for (const t of [...fromA, ...fromB]) m.set(t.id, t);
      cb([...m.values()].filter((t) => t.deletedAt === null).sort(cmpDesc));
    };
    const u1 = onSnapshot(
      query(transactionsCol(ledgerId), where("accountId", "==", accountId)),
      (s) => {
        fromA = s.docs.map(fromSnapshot);
        emit();
      },
      (e) => console.error("byAccount(from)", e),
    );
    const u2 = onSnapshot(
      query(transactionsCol(ledgerId), where("toAccountId", "==", accountId)),
      (s) => {
        fromB = s.docs.map(fromSnapshot);
        emit();
      },
      (e) => console.error("byAccount(to)", e),
    );
    return () => {
      u1();
      u2();
    };
  },

  /** Live per-account balance rollup ({ accountId: netFlow minor units }). */
  subscribeBalances(ledgerId: string, cb: (netFlow: Record<string, number>) => void): Unsubscribe {
    return onSnapshot(
      rollupRef(ledgerId),
      (snap) => cb((snap.data()?.netFlow as Record<string, number>) ?? {}),
      (e) => console.error("balances", e),
    );
  },

  /** Edit in place (loose model): reverse the old effect, apply the new one. */
  async update(ledgerId: string, id: string, patch: Partial<NewTransactionInput>): Promise<void> {
    await runTransaction(db, async (tx) => {
      const ref = doc(transactionsCol(ledgerId), id);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const old = snap.data();
      const data: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
      if (patch.date) {
        data.date = Timestamp.fromDate(patch.date);
        data.yearMonth = yearMonthOf(patch.date);
      }
      tx.update(ref, data);

      const merged = {
        type: (patch.type ?? old.type) as EventType,
        accountId: patch.accountId ?? old.accountId,
        toAccountId: patch.toAccountId !== undefined ? patch.toAccountId : (old.toAccountId ?? null),
        baseAmount: patch.baseAmount ?? old.baseAmount,
      };
      const deltas: Record<string, number> = {};
      const merge = (m: Record<string, number>) => {
        for (const [k, v] of Object.entries(m)) deltas[k] = (deltas[k] ?? 0) + v;
      };
      if ((old.deletedAt ?? null) === null) merge(accountDeltas(old as never, -1));
      merge(accountDeltas(merged, 1));
      tx.set(rollupRef(ledgerId), rollupDelta(deltas), { merge: true });
    });
  },

  /** Soft delete (ADR-0004): mark deleted and remove its effect from the rollup. */
  async softDelete(ledgerId: string, id: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const ref = doc(transactionsCol(ledgerId), id);
      const snap = await tx.get(ref);
      if (!snap.exists() || (snap.data().deletedAt ?? null) !== null) return;
      tx.update(ref, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.set(rollupRef(ledgerId), rollupDelta(accountDeltas(snap.data() as never, -1)), {
        merge: true,
      });
    });
  },

  /** Undo a soft delete and re-apply its effect. */
  async restore(ledgerId: string, id: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const ref = doc(transactionsCol(ledgerId), id);
      const snap = await tx.get(ref);
      if (!snap.exists() || (snap.data().deletedAt ?? null) === null) return;
      tx.update(ref, { deletedAt: null, updatedAt: serverTimestamp() });
      tx.set(rollupRef(ledgerId), rollupDelta(accountDeltas(snap.data() as never, 1)), {
        merge: true,
      });
    });
  },

  /** Distinct historical titles starting with `prefix`, for entry autocomplete. */
  async suggestTitles(ledgerId: string, prefix: string, max = 6): Promise<TitleSuggestion[]> {
    const p = prefix.trim();
    if (!p) return [];
    const q = query(
      transactionsCol(ledgerId),
      where("title", ">=", p),
      where("title", "<=", p + ""),
      orderBy("title"),
      limit(30),
    );
    const snap = await getDocs(q);
    const best = new Map<string, Transaction>();
    for (const d of snap.docs) {
      const t = fromSnapshot(d);
      if (t.deletedAt) continue;
      const title = t.title.trim();
      if (!title) continue;
      const cur = best.get(title);
      if (!cur || t.date.getTime() > cur.date.getTime()) best.set(title, t);
    }
    return [...best.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, max)
      .map((t) => ({
        title: t.title.trim(),
        type: t.type,
        categoryId: t.categoryId,
        accountId: t.accountId,
        toAccountId: t.toAccountId,
      }));
  },
};
