import { useEffect, useState } from "react";
import { holdingRepo } from "./holdingRepo";
import { lastQuarterlyAnchor } from "../lib/date";
import type { Holding } from "../domain/types";

/**
 * True when it's time to record stock prices: there are active holdings but none
 * has been re-priced since the most recent quarterly anchor (Mar/Jun/Sep/Dec 15).
 * Checked client-side (Vault has no backend for real push) — surfaced as an
 * in-app reminder while the app is open, clearing once prices are updated.
 */
export function useStockReminder(ledgerId: string): boolean {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  useEffect(() => {
    if (!ledgerId) return;
    setHoldings([]);
    return holdingRepo.subscribeHoldings(ledgerId, setHoldings);
  }, [ledgerId]);

  const active = holdings.filter((h) => !h.archived);
  if (active.length === 0) return false;
  const lastPriced = Math.max(...active.map((h) => h.pricedAt?.getTime() ?? 0));
  return lastPriced < lastQuarterlyAnchor(Date.now());
}
