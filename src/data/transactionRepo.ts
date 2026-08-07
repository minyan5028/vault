/**
 * The persistence seam for Financial Events, scoped by `ledgerId`.
 *
 * Reads are Firestore queries and live subscriptions. Writes are split in two:
 * `writes.ts` decides the WritePlan (pure, tested), `firestoreExec` commits it.
 * Each method here is therefore only the glue — read what's needed, plan, run —
 * which is why the interesting rules no longer live in this file.
 *
 * Every write also maintains a per-account balance rollup at
 * `ledgers/{id}/meta/balances` and per-month rollups at `ledgers/{id}/rollups`,
 * so the Assets and Stats pages read a few small documents instead of every
 * transaction. See `ledgerEffect` for what a write does to them, and
 * scripts/recompute_*.mjs for the one-time backfill / repair.
 */
import {
  Timestamp,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { yearMonthOf } from "../lib/date";
import type { StoredEventFields } from "../lib/ledgerEffect";
import type { EventType, MonthlyRollup, Transaction } from "../domain/types";
import { collectionRef, commitPlan, commitPlanned, docRef, newDocId } from "./firestoreExec";
import {
  EMPTY_PLAN,
  balanceRollupPath,
  rollupsPath,
  transactionPath,
  transactionsPath,
} from "./writePlan";
import {
  planAddEvent,
  planRestoreEvent,
  planSoftDeleteEvent,
  planUpdateEvent,
  type NewTransactionInput,
} from "./writes";

export type { NewTransactionInput, EntryDraft } from "./writes";

export interface TitleSuggestion {
  title: string;
  type: EventType;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
}

const transactionsCol = (ledgerId: string) => collectionRef(transactionsPath(ledgerId));

const cmpDesc = (a: Transaction, b: Transaction) =>
  b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/**
 * Read a stored Firestore document as the fields the projections need. The
 * `yearMonth` fallback covers documents written before it was denormalized —
 * without it an old event would reverse out of the wrong month.
 */
export function asStored(d: DocumentData): StoredEventFields {
  return {
    type: d.type,
    accountId: d.accountId,
    toAccountId: d.toAccountId ?? null,
    amount: d.amount,
    toAmount: d.toAmount ?? d.amount,
    baseAmount: d.baseAmount,
    fxRate: d.fxRate,
    categoryId: d.categoryId ?? null,
    yearMonth: d.yearMonth ?? yearMonthOf((d.date as Timestamp).toDate()),
  };
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

export const transactionRepo = {
  /** Record a Financial Event and bump the rollups. Returns the new id. */
  async add(ledgerId: string, input: NewTransactionInput): Promise<string> {
    const txId = newDocId(transactionsPath(ledgerId));
    await commitPlan(planAddEvent(ledgerId, txId, input));
    return txId;
  },

  /**
   * Idempotent add at a caller-chosen id, for recurring catch-up: if the doc
   * already exists (this occurrence was generated before — a partial run, or a
   * second device), do nothing. Reading in a transaction makes the check +
   * write atomic, so the rollups can't double-count. Returns true if it created.
   */
  addRecurring(ledgerId: string, id: string, input: NewTransactionInput): Promise<boolean> {
    return commitPlanned(async (tx) => {
      const snap = await tx.get(docRef(transactionPath(ledgerId, id)));
      if (snap.exists()) return { plan: EMPTY_PLAN, result: false };
      return { plan: planAddEvent(ledgerId, id, input), result: true };
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
      docRef(balanceRollupPath(ledgerId)),
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
      collectionRef(rollupsPath(ledgerId)),
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
    await commitPlanned(async (tx) => {
      const snap = await tx.get(docRef(transactionPath(ledgerId, id)));
      if (!snap.exists()) return { plan: EMPTY_PLAN, result: undefined };
      const deleted = (snap.data().deletedAt ?? null) !== null;
      return {
        plan: planUpdateEvent(ledgerId, id, asStored(snap.data()), patch, { deleted }),
        result: undefined,
      };
    });
  },

  /** Soft delete (ADR-0004): mark deleted and remove its effect from the rollups. */
  async softDelete(ledgerId: string, id: string): Promise<void> {
    await commitPlanned(async (tx) => {
      const snap = await tx.get(docRef(transactionPath(ledgerId, id)));
      if (!snap.exists() || (snap.data().deletedAt ?? null) !== null) {
        return { plan: EMPTY_PLAN, result: undefined };
      }
      return {
        plan: planSoftDeleteEvent(ledgerId, id, asStored(snap.data())),
        result: undefined,
      };
    });
  },

  /** Undo a soft delete and re-apply its effect. */
  async restore(ledgerId: string, id: string): Promise<void> {
    await commitPlanned(async (tx) => {
      const snap = await tx.get(docRef(transactionPath(ledgerId, id)));
      if (!snap.exists() || (snap.data().deletedAt ?? null) === null) {
        return { plan: EMPTY_PLAN, result: undefined };
      }
      return { plan: planRestoreEvent(ledgerId, id, asStored(snap.data())), result: undefined };
    });
  },

  /** Distinct historical titles starting with `prefix`, for entry autocomplete. */
  async suggestTitles(ledgerId: string, prefix: string, max = 6): Promise<TitleSuggestion[]> {
    const p = prefix.trim();
    if (!p) return [];
    const q = query(
      transactionsCol(ledgerId),
      where("title", ">=", p),
      where("title", "<=", p + ""),
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
