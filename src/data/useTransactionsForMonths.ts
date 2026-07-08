import { useEffect, useState } from "react";
import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/**
 * One-shot fetch of active transactions across the given months, merged. For
 * on-demand detail views (e.g. the by-title breakdown) that need raw titles
 * which the rollups don't carry. Pass an empty list to fetch nothing.
 */
export function useTransactionsForMonths(ledgerId: string, months: string[]): Transaction[] {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const key = months.join(",");
  useEffect(() => {
    let cancelled = false;
    setTxns([]);
    if (!ledgerId || months.length === 0) return;
    transactionRepo
      .fetchMonths(ledgerId, months)
      .then((rows) => !cancelled && setTxns(rows))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId, key]);
  return txns;
}
