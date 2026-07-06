import { useEffect, useState } from "react";
import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/** Live full history for one account (bounded to that account, not the ledger). */
export function useAccountTransactions(ledgerId: string, accountId: string): Transaction[] {
  const [txns, setTxns] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!ledgerId || !accountId) return;
    setTxns([]);
    return transactionRepo.subscribeByAccount(ledgerId, accountId, setTxns);
  }, [ledgerId, accountId]);
  return txns;
}
