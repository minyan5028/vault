/**
 * Account balance math derived from transactions (balances are never stored —
 * see docs/DATA_MODEL.md). Amounts are minor units in each account's own
 * currency: the source account moves by `amount`, a transfer's destination by
 * `toAmount` (equal to `amount` unless it's a cross-currency transfer). Not
 * `baseAmount` — that TWD snapshot is only for income/expense stats (ADR-0002).
 */
import type { EventType, Transaction } from "../domain/types";

/**
 * Signed per-account balance deltas for one transaction (minor units, each
 * account in its own currency), scaled by `sign`. The source account moves by
 * `amount`, a transfer's destination by `toAmount` (= amount unless cross-
 * currency). Shared by the client balance view and the server rollup writes, so
 * both agree; also drives the holding-deletion cash reversal.
 */
export function accountDeltas(
  t: {
    type: EventType;
    accountId: string;
    toAccountId: string | null;
    amount: number;
    toAmount?: number;
  },
  sign: 1 | -1,
): Record<string, number> {
  const d: Record<string, number> = {};
  const add = (acc: string | null, v: number) => {
    if (acc) d[acc] = (d[acc] ?? 0) + v * sign;
  };
  if (t.type === "income") add(t.accountId, t.amount);
  else if (t.type === "expense") add(t.accountId, -t.amount);
  else if (t.type === "transfer") {
    add(t.accountId, -t.amount);
    add(t.toAccountId, t.toAmount ?? t.amount);
  }
  return d;
}

/**
 * Drop the accounts that don't actually move, leaving only non-zero deltas.
 *
 * Callers must treat an empty result as "write nothing to the rollup". A
 * balance delta can cancel out completely in ordinary use — a same-account
 * transfer, a zero amount, an edit that touches only the title/category/date,
 * deleting a holding whose legs net to zero — and persisting that as an empty
 * `netFlow` map would wipe the whole rollup (see `rollupDelta` in
 * transactionRepo for why Firestore treats it that way).
 */
export function pruneZeroDeltas(deltas: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [acc, v] of Object.entries(deltas)) if (v !== 0) out[acc] = v;
  return out;
}

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
