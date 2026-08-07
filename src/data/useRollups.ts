import type { MonthlyRollup } from "../domain/types";
import { transactionRepo } from "./transactionRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: MonthlyRollup[] = [];

/**
 * Live per-month rollups over an inclusive [startYm, endYm] range, oldest
 * first. A handful of small docs instead of every transaction — the read-cheap
 * source for Stats and trends (see MonthlyRollup).
 */
export function useRollups(ledgerId: string, startYm: string, endYm: string): MonthlyRollup[] {
  return useLiveQuery(`${ledgerId}|${startYm}|${endYm}`, NONE, (emit) =>
    transactionRepo.subscribeRollups(ledgerId, startYm, endYm, emit),
  );
}
