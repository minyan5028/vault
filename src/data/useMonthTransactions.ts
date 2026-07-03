import { useEffect, useState } from "react";
import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/** Live transactions for a ledger + month (auto-updates, offline-capable). */
export function useMonthTransactions(ledgerId: string, yearMonth: string): Transaction[] {
  const [txns, setTxns] = useState<Transaction[]>([]);
  useEffect(() => {
    setTxns([]);
    return transactionRepo.subscribeByMonth(ledgerId, yearMonth, setTxns);
  }, [ledgerId, yearMonth]);
  return txns;
}
