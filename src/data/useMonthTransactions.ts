import { useEffect, useState } from "react";
import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/**
 * Live transactions for a ledger + month. Kicks off a one-shot fetch so the
 * month populates immediately (even the first time it's opened), then keeps it
 * live via a subscription. Offline-capable.
 */
export function useMonthTransactions(ledgerId: string, yearMonth: string): Transaction[] {
  const [txns, setTxns] = useState<Transaction[]>([]);
  useEffect(() => {
    let cancelled = false;
    const apply = (rows: Transaction[]) => {
      if (!cancelled) setTxns(rows);
    };
    setTxns([]);
    transactionRepo.fetchMonth(ledgerId, yearMonth).then(apply).catch(console.error);
    const unsub = transactionRepo.subscribeByMonth(ledgerId, yearMonth, apply);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ledgerId, yearMonth]);
  return txns;
}
