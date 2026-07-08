import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/**
 * Live active transactions across the given months, merged, newest first. For
 * on-demand detail views (the by-title breakdown and category/title drill-down)
 * that need raw rows the rollups don't carry. Live so edits/deletes reflect
 * immediately. Pass an empty list to subscribe to nothing.
 */
export function useTransactionsForMonths(ledgerId: string, months: string[]): Transaction[] {
  const [byMonth, setByMonth] = useState<Record<string, Transaction[]>>({});
  const key = months.join(",");
  useEffect(() => {
    setByMonth({});
    if (!ledgerId || months.length === 0) return;
    const unsubs = months.map((m) =>
      transactionRepo.subscribeByMonth(ledgerId, m, (rows) =>
        setByMonth((prev) => ({ ...prev, [m]: rows })),
      ),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId, key]);

  return useMemo(
    () =>
      Object.values(byMonth)
        .flat()
        .sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime()),
    [byMonth],
  );
}
