import { useEffect, useState } from "react";
import type { Holding, PortfolioSnapshot } from "../domain/types";
import { holdingRepo } from "./holdingRepo";

/** Live holdings + current FX rates + valuation snapshots for a ledger. */
export function useHoldings(ledgerId: string): {
  holdings: Holding[];
  fx: Record<string, number>;
  snapshots: PortfolioSnapshot[];
} {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [fx, setFx] = useState<Record<string, number>>({});
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  useEffect(() => {
    if (!ledgerId) return;
    setHoldings([]);
    setFx({});
    setSnapshots([]);
    const u1 = holdingRepo.subscribeHoldings(ledgerId, setHoldings);
    const u2 = holdingRepo.subscribeFx(ledgerId, setFx);
    const u3 = holdingRepo.subscribeSnapshots(ledgerId, setSnapshots);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [ledgerId]);
  return { holdings, fx, snapshots };
}
