/**
 * Account balance math derived from transactions (balances are never stored —
 * see docs/DATA_MODEL.md). Amounts are minor units in each account's own
 * currency: the source account moves by `amount`, a transfer's destination by
 * `toAmount` (equal to `amount` unless it's a cross-currency transfer). Not
 * `baseAmount` — that TWD snapshot is only for income/expense stats (ADR-0002).
 */
import type { Transaction } from "../domain/types";

/** Signed effect of one transaction on one account's balance. */
export function effectOn(tx: Transaction, accountId: string): number {
  let e = 0;
  if (tx.accountId === accountId) e += tx.type === "income" ? tx.amount : -tx.amount;
  if (tx.type === "transfer" && tx.toAccountId === accountId) e += tx.toAmount;
  return e;
}

/** Net flow per account across the given transactions (accountId → minor units). */
export function netFlowByAccount(txns: readonly Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  for (const tx of txns) {
    if (tx.type === "expense") add(tx.accountId, -tx.amount);
    else if (tx.type === "income") add(tx.accountId, tx.amount);
    else if (tx.type === "transfer") {
      add(tx.accountId, -tx.amount);
      if (tx.toAccountId) add(tx.toAccountId, tx.toAmount);
    }
  }
  return m;
}

/** Deposits (money in) and withdrawals (money out) for one account. */
export function depositsWithdrawals(
  txns: readonly Transaction[],
  accountId: string,
): { deposits: number; withdrawals: number } {
  let deposits = 0;
  let withdrawals = 0;
  for (const tx of txns) {
    if (tx.type === "transfer" && tx.toAccountId === accountId) deposits += tx.toAmount;
    if (tx.accountId === accountId) {
      if (tx.type === "income") deposits += tx.amount;
      else withdrawals += tx.amount;
    }
  }
  return { deposits, withdrawals };
}

/**
 * Running balance after each transaction for one account, given a starting
 * balance. Applies `txns` in the order provided (caller sorts chronologically).
 * Returns a map of transaction id → balance after that transaction.
 */
export function runningBalances(
  txns: readonly Transaction[],
  accountId: string,
  startBalance: number,
): Map<string, number> {
  const map = new Map<string, number>();
  let running = startBalance;
  for (const tx of txns) {
    running += effectOn(tx, accountId);
    map.set(tx.id, running);
  }
  return map;
}
