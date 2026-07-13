import { useEffect, useState } from "react";
import type { Holding } from "../domain/types";
import { holdingRepo } from "./holdingRepo";

/** Live holdings + current FX rates for a ledger. Valuation snapshots are a
 *  separate hook (useSnapshots) since only the Investments trend needs them —
 *  the Assets/Manage pages shouldn't subscribe to snapshots they don't use. */
export function useHoldings(ledgerId: string): {
  holdings: Holding[];
  fx: Record<string, number>;
} {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [fx, setFx] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ledgerId) return;
    setHoldings([]);
    setFx({});
    const u1 = holdingRepo.subscribeHoldings(ledgerId, setHoldings);
    const u2 = holdingRepo.subscribeFx(ledgerId, setFx);
    return () => {
      u1();
      u2();
    };
  }, [ledgerId]);
  return { holdings, fx };
}
