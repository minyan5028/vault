/**
 * Pure aggregation math for the per-month rollups (see `MonthlyRollup`). Kept
 * free of Firestore so it can be unit-tested; `transactionRepo` wraps these
 * numbers in atomic `increment()` writes, and the backfill script re-derives
 * absolute totals from the same rules.
 *
 * Every fold here iterates `BREAKDOWNS` rather than naming the maps, so a new
 * dimension is added in one place (`domain/types.ts`) and cannot be forgotten
 * by half the pipeline.
 */
import {
  BREAKDOWNS,
  UNCATEGORIZED,
  emptyBreakdowns,
  type EventType,
  type MonthlyRollup,
  type RollupContribution,
} from "../domain/types";

export type { RollupContribution };

/**
 * The projection-relevant classification of one Financial Event.
 *
 * `projectId` is required, not optional, exactly like `categoryId`: a caller
 * that simply forgot the field would otherwise rebuild every month with empty
 * Project maps — and `scripts/recompute_rollups.mjs` *deletes* the stored docs
 * before rewriting, so the data would be erased rather than left unrepaired.
 */
interface Classified {
  type: EventType;
  baseAmount: number;
  categoryId: string | null;
  projectId: string | null;
}

/**
 * Signed contribution of one transaction to its month's rollup. `sign` is +1
 * to apply, -1 to reverse. Transfers contribute nothing (they move money
 * between accounts, not income/expense) — including to the Project maps, so
 * buying foreign cash for a trip and then spending it is never counted twice.
 */
export function monthContribution(t: Classified, sign: 1 | -1): RollupContribution | null {
  if (t.type === "transfer") return null;
  const category = t.categoryId ?? UNCATEGORIZED;
  const project = t.projectId ?? null;
  const v = t.baseAmount * sign;
  const maps = emptyBreakdowns();
  if (t.type === "income") {
    maps.incomeByCategory[category] = v;
    if (project) maps.incomeByProject[project] = v;
    return { income: v, expense: 0, ...maps };
  }
  maps.expenseByCategory[category] = v;
  if (project) maps.expenseByProject[project] = v;
  return { income: 0, expense: v, ...maps };
}

function emptyContribution(): RollupContribution {
  return { income: 0, expense: 0, ...emptyBreakdowns() };
}

/** Accumulate a contribution into a per-yearMonth map (a no-op for null). */
export function addContribution(
  acc: Map<string, RollupContribution>,
  yearMonth: string,
  c: RollupContribution | null,
): void {
  if (!c) return;
  const cur = acc.get(yearMonth) ?? emptyContribution();
  cur.income += c.income;
  cur.expense += c.expense;
  for (const b of BREAKDOWNS)
    for (const [k, v] of Object.entries(c[b])) cur[b][k] = (cur[b][k] ?? 0) + v;
  acc.set(yearMonth, cur);
}

/** Sum several months' rollups into one aggregate (e.g. a whole year). */
export function sumRollups(rollups: MonthlyRollup[]): RollupContribution {
  const out = emptyContribution();
  for (const r of rollups) {
    out.income += r.income;
    out.expense += r.expense;
    for (const b of BREAKDOWNS)
      for (const [k, v] of Object.entries(r[b])) out[b][k] = (out[b][k] ?? 0) + v;
  }
  return out;
}

/**
 * Everyday spending: the month's expense minus everything the Projects account
 * for. Derived by subtraction rather than stored, so it can never disagree with
 * the headline total (ADR-0009).
 */
export function everydayExpense(r: Pick<RollupContribution, "expense" | "expenseByProject">): number {
  return r.expense - Object.values(r.expenseByProject).reduce((s, v) => s + v, 0);
}

/** The same, for income. */
export function everydayIncome(r: Pick<RollupContribution, "income" | "incomeByProject">): number {
  return r.income - Object.values(r.incomeByProject).reduce((s, v) => s + v, 0);
}

/** Absolute rollups for a set of transactions, keyed by yearMonth. Used by the
 *  backfill to rebuild docs from scratch (deleted transactions excluded). */
export function rollupsFrom(
  txns: (Classified & { yearMonth: string })[],
): Map<string, MonthlyRollup> {
  const acc = new Map<string, RollupContribution>();
  for (const t of txns) addContribution(acc, t.yearMonth, monthContribution(t, 1));
  const out = new Map<string, MonthlyRollup>();
  for (const [yearMonth, c] of acc) out.set(yearMonth, { yearMonth, ...c });
  return out;
}
