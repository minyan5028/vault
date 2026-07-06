import { useEffect, useState } from "react";
import { transactionRepo } from "./transactionRepo";

/** Live per-account net flow (minor units) from the ledger's balance rollup. */
export function useBalances(ledgerId: string): Record<string, number> {
  const [netFlow, setNetFlow] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ledgerId) return;
    setNetFlow({});
    return transactionRepo.subscribeBalances(ledgerId, setNetFlow);
  }, [ledgerId]);
  return netFlow;
}
