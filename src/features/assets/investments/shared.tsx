import type { Holding, HoldingClass } from "../../../domain/types";

export const BASE_CURRENCY = "TWD";
export const CLASSES: HoldingClass[] = ["growth", "dividend"];

/** Whether the current price has reached the review target (an upside price the
 *  user flagged to re-evaluate at). No target ⇒ never. */
export const atTarget = (h: Pick<Holding, "price" | "targetPrice">) =>
  h.targetPrice != null && h.targetPrice > 0 && h.price >= h.targetPrice;

/** Format a fraction as a signed percentage, e.g. 0.123 → "+12.3%". */
export function formatPct(frac: number): string {
  const sign = frac > 0 ? "+" : frac < 0 ? "−" : "";
  return `${sign}${(Math.abs(frac) * 100).toFixed(1)}%`;
}

// Scaling and parsing live in lib/money.ts — the one module that knows the ×100
// and ×10000 rules (ADR-0001). Import parseAmount / parseShares / amountInput /
// sharesInput / formatShares from there rather than re-deriving them here.

export const inputClass =
  "mt-0.5 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600";
