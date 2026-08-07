import { transactionRepo } from "./transactionRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: Record<string, number> = {};

/** Live per-account net flow (minor units) from the ledger's balance rollup. */
export function useBalances(ledgerId: string): Record<string, number> {
  return useLiveQuery(ledgerId, NONE, (emit) =>
    transactionRepo.subscribeBalances(ledgerId, emit),
  );
}
