import { useEffect, useState } from "react";
import type { PortfolioSnapshot } from "../domain/types";
import { holdingRepo } from "./holdingRepo";

/** Live valuation snapshots for a ledger — its own subscription so only the
 *  Investments value-trend pulls them (not the Assets/Manage pages). */
export function useSnapshots(ledgerId: string): PortfolioSnapshot[] {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  useEffect(() => {
    if (!ledgerId) return;
    setSnapshots([]);
    return holdingRepo.subscribeSnapshots(ledgerId, setSnapshots);
  }, [ledgerId]);
  return snapshots;
}
