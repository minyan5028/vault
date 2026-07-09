import { useEffect } from "react";
import { holdingRepo } from "./holdingRepo";
import { fetchRatesIntoTwd } from "../lib/fxApi";
import type { Account } from "../domain/types";

const WEEK = 7 * 24 * 3600 * 1000;

/**
 * Once per app load, refresh foreign-currency rates into `meta/fx` if they're
 * over a week old. Client-triggered because Vault has no backend — effectively
 * a weekly update (you open the app about that often). Only the non-TWD
 * currencies actually in use are fetched, and only net-worth valuation is
 * affected (historical transactions keep their entry-locked fxRate, ADR-0002).
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
      if (meta.updatedAt != null && Date.now() - meta.updatedAt < WEEK) return; // still fresh
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
