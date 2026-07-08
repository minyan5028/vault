import { useEffect, useState } from "react";
import type { MonthlyRollup } from "../domain/types";
import { transactionRepo } from "./transactionRepo";

/**
 * Live per-month rollups over an inclusive [startYm, endYm] range, oldest
 * first. A handful of small docs instead of every transaction — the read-cheap
 * source for Stats and trends (see MonthlyRollup).
 */
export function useRollups(ledgerId: string, startYm: string, endYm: string): MonthlyRollup[] {
  const [rollups, setRollups] = useState<MonthlyRollup[]>([]);
  useEffect(() => {
    setRollups([]);
    if (!ledgerId) return;
    const unsub = transactionRepo.subscribeRollups(ledgerId, startYm, endYm, setRollups);
    return unsub;
  }, [ledgerId, startYm, endYm]);
  return rollups;
}
