import { useEffect } from "react";
import { holdingRepo } from "./holdingRepo";
import { fetchRatesIntoTwd } from "../lib/fxApi";
import type { Account } from "../domain/types";

/** Local-time midnight of the most recent Monday (start of the current week). */
function thisMondayMidnight(now: number): number {
  const d = new Date(now);
  const daysSinceMonday = (d.getDay() + 6) % 7; // Mon→0, Tue→1, … Sun→6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/**
 * Refresh foreign-currency rates into `meta/fx` once per week, anchored to
 * Monday. On app load, if rates haven't been fetched since this week's Monday
 * midnight, fetch now — so the fetch lands the first time you open the app each
 * week (typically Mon/Tue) and doesn't drift later week over week. Client-
 * triggered because Vault has no backend. Only the non-TWD currencies in use
 * are fetched, and only net-worth valuation is affected (historical
 * transactions keep their entry-locked fxRate, ADR-0002).
 */
export function useFxAutoRefresh(ledgerId: string, accounts: Account[]): void {
  const foreignKey = [...new Set(accounts.map((a) => a.currency))]
    .filter((c) => c !== "TWD")
    .sort()
    .join(",");

  useEffect(() => {
    if (!ledgerId || !foreignKey) return;
    const currencies = foreignKey.split(",");
    let cancelled = false;
    (async () => {
      const meta = await holdingRepo.getFxMeta(ledgerId);
      // Already fetched this week (since Monday)? Skip.
      if (meta.updatedAt != null && meta.updatedAt >= thisMondayMidnight(Date.now())) return;
      const rates = await fetchRatesIntoTwd(currencies);
      if (!cancelled && Object.keys(rates).length > 0) {
        await holdingRepo.setFxRates(ledgerId, rates);
      }
    })().catch((e) => console.error("fx auto-refresh", e));
    return () => {
      cancelled = true;
    };
  }, [ledgerId, foreignKey]);
}
