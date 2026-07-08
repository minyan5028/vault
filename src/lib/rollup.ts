/**
 * Pure aggregation math for the per-month rollups (see `MonthlyRollup`). Kept
 * free of Firestore so it can be unit-tested; `transactionRepo` wraps these
 * numbers in atomic `increment()` writes, and the backfill script re-derives
 * absolute totals from the same rules.
 */
import { UNCATEGORIZED, type EventType, type MonthlyRollup } from "../domain/types";

export interface RollupContribution {
  income: number;
  expense: number;
  expenseByCategory: Record<string, number>;
  incomeByCategory: Record<string, number>;
}

/**
 * Signed contribution of one transaction to its month's rollup. `sign` is +1
 * to apply, -1 to reverse. Transfers contribute nothing (they move money
 * between accounts, not income/expense).
 */
export function monthContribution(
  t: { type: EventType; baseAmount: number; categoryId: string | null },
  sign: 1 | -1,
): RollupContribution | null {
  if (t.type === "transfer") return null;
  const key = t.categoryId ?? UNCATEGORIZED;
  const v = t.baseAmount * sign;
  if (t.type === "income")
    return { income: v, expense: 0, incomeByCategory: { [key]: v }, expenseByCategory: {} };
  return { income: 0, expense: v, expenseByCategory: { [key]: v }, incomeByCategory: {} };
}

function emptyContribution(): RollupContribution {
  return { income: 0, expense: 0, expenseByCategory: {}, incomeByCategory: {} };
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
  for (const [k, v] of Object.entries(c.expenseByCategory))
    cur.expenseByCategory[k] = (cur.expenseByCategory[k] ?? 0) + v;
  for (const [k, v] of Object.entries(c.incomeByCategory))
    cur.incomeByCategory[k] = (cur.incomeByCategory[k] ?? 0) + v;
  acc.set(yearMonth, cur);
}

/** Sum several months' rollups into one aggregate (e.g. a whole year). */
export function sumRollups(rollups: MonthlyRollup[]): Omit<MonthlyRollup, "yearMonth"> {
  const out = { income: 0, expense: 0, expenseByCategory: {}, incomeByCategory: {} } as Omit<
    MonthlyRollup,
    "yearMonth"
  >;
  for (const r of rollups) {
    out.income += r.income;
    out.expense += r.expense;
    for (const [k, v] of Object.entries(r.expenseByCategory))
      out.expenseByCategory[k] = (out.expenseByCategory[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.incomeByCategory))
      out.incomeByCategory[k] = (out.incomeByCategory[k] ?? 0) + v;
  }
  return out;
}

/** Absolute rollups for a set of transactions, keyed by yearMonth. Used by the
 *  backfill to rebuild docs from scratch (deleted transactions excluded). */
export function rollupsFrom(
  txns: { type: EventType; baseAmount: number; categoryId: string | null; yearMonth: string }[],
): Map<string, MonthlyRollup> {
  const acc = new Map<string, RollupContribution>();
  for (const t of txns) addContribution(acc, t.yearMonth, monthContribution(t, 1));
  const out = new Map<string, MonthlyRollup>();
  for (const [yearMonth, c] of acc) out.set(yearMonth, { yearMonth, ...c });
  return out;
}
