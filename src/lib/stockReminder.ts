import { lastQuarterlyAnchor } from "./date";
import type { Holding } from "../domain/types";

/**
 * Whether it's time to record stock prices: there are active holdings, but none
 * has been re-priced since the most recent quarterly anchor (Mar/Jun/Sep/Dec
 * 15). Checked client-side — Vault has no backend for real push — so it
 * surfaces as an in-app reminder while the app is open, and clears as soon as
 * any holding is re-priced.
 *
 * A holding that has never been priced counts as overdue, not as absent.
 */
export function isStockReminderDue(
  holdings: readonly Pick<Holding, "archived" | "pricedAt">[],
  now: number,
): boolean {
  const active = holdings.filter((h) => !h.archived);
  if (active.length === 0) return false;
  const lastPriced = Math.max(...active.map((h) => h.pricedAt?.getTime() ?? 0));
  return lastPriced < lastQuarterlyAnchor(now);
}
