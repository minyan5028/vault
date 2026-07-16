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
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { yearMonthOf } from "../lib/date";
import { addContribution, monthContribution, type RollupContribution } from "../lib/rollup";
import { accountDeltas } from "../lib/balance";
import type { EventType, MonthlyRollup, Transaction } from "../domain/types";

export interface NewTransactionInput {
  type: EventType;
  amount: number;
  currency: string;
  /** Cross-currency transfer only: amount credited to toAccountId in its
   *  currency. Omit for same-currency / income / expense (defaults to amount). */
  toAmount?: number;
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
const rollupsCol = (ledgerId: string) => collection(db, "ledgers", ledgerId, "rollups");
const monthRollupRef = (ledgerId: string, ym: string) => doc(rollupsCol(ledgerId), ym);

const cmpDesc = (a: Transaction, b: Transaction) =>
  b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/** A set-merge payload that atomically increments the rollup's netFlow map. */
function rollupDelta(deltas: Record<string, number>) {
  const netFlow: Record<string, unknown> = {};
  for (const [acc, v] of Object.entries(deltas)) if (v !== 0) netFlow[acc] = increment(v);
  return { netFlow };
}

/** Turn a signed month contribution into an atomic-increment set-merge payload
 *  (with the queryable `yearMonth` field and a touch timestamp). */
function monthRollupDelta(ym: string, c: RollupContribution): Record<string, unknown> {
  const p: Record<string, unknown> = { yearMonth: ym, updatedAt: serverTimestamp() };
  if (c.income !== 0) p.income = increment(c.income);
  if (c.expense !== 0) p.expense = increment(c.expense);
  const byCat = (m: Record<string, number>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) if (v !== 0) out[k] = increment(v);
    return Object.keys(out).length ? out : null;
  };
  const ec = byCat(c.expenseByCategory);
  const ic = byCat(c.incomeByCategory);
  if (ec) p.expenseByCategory = ec;
  if (ic) p.incomeByCategory = ic;
  return p;
}

function rollupFromSnapshot(snap: QueryDocumentSnapshot<DocumentData>): MonthlyRollup {
  const d = snap.data();
  return {
    yearMonth: d.yearMonth ?? snap.id,
    income: d.income ?? 0,
    expense: d.expense ?? 0,
    expenseByCategory: d.expenseByCategory ?? {},
    incomeByCategory: d.incomeByCategory ?? {},
  };
}

function fromSnapshot(snap: QueryDocumentSnapshot<DocumentData>): Transaction {
  const d = snap.data();
  return {
    id: snap.id,
    type: d.type,
    amount: d.amount,
    currency: d.currency,
    toAmount: d.toAmount ?? d.amount,
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

/**
 * Append a transfer Financial Event to an existing batch and bump the balance
 * rollup, so a holding buy/sell and its cash leg commit atomically (see
 * holdingRepo). Transfers contribute nothing to the month income/expense
 * rollup, so only the balance rollup is touched.
 */
export function writeTransferToBatch(
  batch: WriteBatch,
  ledgerId: string,
  input: NewTransactionInput,
): void {
  const ref = doc(transactionsCol(ledgerId));
  batch.set(ref, {
    ...input,
    toAmount: input.toAmount ?? input.amount,
    date: Timestamp.fromDate(input.date),
    yearMonth: yearMonthOf(input.date),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
  });
  batch.set(rollupRef(ledgerId), rollupDelta(accountDeltas(input, 1)), { merge: true });
}

/** Soft-delete a transaction within a batch (no rollup change — caller nets the
 *  balance deltas and applies them once with `commitBalanceDelta`). */
export function softDeleteInBatch(batch: WriteBatch, ledgerId: string, txId: string): void {
  batch.update(doc(transactionsCol(ledgerId), txId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Apply a combined balance delta to the rollup within a batch (one write). */
export function commitBalanceDelta(
  batch: WriteBatch,
  ledgerId: string,
  deltas: Record<string, number>,
): void {
  if (Object.keys(deltas).length > 0)
    batch.set(rollupRef(ledgerId), rollupDelta(deltas), { merge: true });
}

export const transactionRepo = {
  /** Record a Financial Event and bump the rollup. Returns the new id. */
  async add(ledgerId: string, input: NewTransactionInput): Promise<string> {
    const ref = doc(transactionsCol(ledgerId));
    const batch = writeBatch(db);
    batch.set(ref, {
      ...input,
      toAmount: input.toAmount ?? input.amount,
      date: Timestamp.fromDate(input.date),
      yearMonth: yearMonthOf(input.date),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null,
    });
    batch.set(rollupRef(ledgerId), rollupDelta(accountDeltas(input, 1)), { merge: true });
    const mc = monthContribution(input, 1);
    if (mc) {
      const ym = yearMonthOf(input.date);
      batch.set(monthRollupRef(ledgerId, ym), monthRollupDelta(ym, mc), { merge: true });
    }
    await batch.commit();
    return ref.id;
  },

  /**
   * Idempotent add at a caller-chosen id, for recurring catch-up: if the doc
   * already exists (this occurrence was generated before — a partial run, or a
   * second device), do nothing. Reading in a transaction makes the check +
   * write atomic, so the rollup can't double-count. Returns true if it created.
   */
  async addRecurring(ledgerId: string, id: string, input: NewTransactionInput): Promise<boolean> {
    return runTransaction(db, async (tx) => {
      const ref = doc(transactionsCol(ledgerId), id);
      if ((await tx.get(ref)).exists()) return false;
      tx.set(ref, {
        ...input,
        toAmount: input.toAmount ?? input.amount,
        date: Timestamp.fromDate(input.date),
        yearMonth: yearMonthOf(input.date),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deletedAt: null,
      });
      tx.set(rollupRef(ledgerId), rollupDelta(accountDeltas(input, 1)), { merge: true });
      const mc = monthContribution(input, 1);
      if (mc) {
        const ym = yearMonthOf(input.date);
        tx.set(monthRollupRef(ledgerId, ym), monthRollupDelta(ym, mc), { merge: true });
      }
      return true;
    });
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

  /** Live per-month rollups over an inclusive [startYm, endYm] range, oldest
   *  first — a few small docs instead of every transaction (see MonthlyRollup). */
  subscribeRollups(
    ledgerId: string,
    startYm: string,
    endYm: string,
    cb: (rollups: MonthlyRollup[]) => void,
  ): Unsubscribe {
    const q = query(
      rollupsCol(ledgerId),
      where("yearMonth", ">=", startYm),
      where("yearMonth", "<=", endYm),
      orderBy("yearMonth"),
    );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(rollupFromSnapshot)),
      (e) => console.error("rollups", e),
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
        amount: patch.amount ?? old.amount,
        toAmount: patch.toAmount !== undefined ? patch.toAmount : (old.toAmount ?? old.amount),
        baseAmount: patch.baseAmount ?? old.baseAmount,
        categoryId: patch.categoryId !== undefined ? patch.categoryId : (old.categoryId ?? null),
      };
      const notDeleted = (old.deletedAt ?? null) === null;

      const deltas: Record<string, number> = {};
      const merge = (m: Record<string, number>) => {
        for (const [k, v] of Object.entries(m)) deltas[k] = (deltas[k] ?? 0) + v;
      };
      if (notDeleted) merge(accountDeltas(old as never, -1));
      merge(accountDeltas(merged, 1));
      tx.set(rollupRef(ledgerId), rollupDelta(deltas), { merge: true });

      // Month rollups: reverse the old month, apply the new — different docs
      // when the date crosses a month boundary.
      const oldYm = old.yearMonth ?? yearMonthOf((old.date as Timestamp).toDate());
      const newYm = patch.date ? yearMonthOf(patch.date) : oldYm;
      const months = new Map<string, RollupContribution>();
      if (notDeleted) addContribution(months, oldYm, monthContribution(old as never, -1));
      addContribution(months, newYm, monthContribution(merged, 1));
      for (const [ym, c] of months)
        tx.set(monthRollupRef(ledgerId, ym), monthRollupDelta(ym, c), { merge: true });
    });
  },

  /** Soft delete (ADR-0004): mark deleted and remove its effect from the rollup. */
  async softDelete(ledgerId: string, id: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const ref = doc(transactionsCol(ledgerId), id);
      const snap = await tx.get(ref);
      if (!snap.exists() || (snap.data().deletedAt ?? null) !== null) return;
      const data = snap.data();
      tx.update(ref, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.set(rollupRef(ledgerId), rollupDelta(accountDeltas(data as never, -1)), { merge: true });
      const mc = monthContribution(data as never, -1);
      if (mc) tx.set(monthRollupRef(ledgerId, data.yearMonth), monthRollupDelta(data.yearMonth, mc), {
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
      const data = snap.data();
      tx.update(ref, { deletedAt: null, updatedAt: serverTimestamp() });
      tx.set(rollupRef(ledgerId), rollupDelta(accountDeltas(data as never, 1)), { merge: true });
      const mc = monthContribution(data as never, 1);
      if (mc) tx.set(monthRollupRef(ledgerId, data.yearMonth), monthRollupDelta(data.yearMonth, mc), {
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
