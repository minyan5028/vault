/**
 * Pure valuation math for holdings (see the Holding domain type). Kept free of
 * Firestore so it can be unit-tested. Money is ×100 minor units; `shares` is
 * ×10000 (4 decimals). `fx` maps a currency to its rate into the base currency
 * (TWD); the base currency itself is treated as rate 1.
 */
import type { Holding, HoldingClass } from "../domain/types";

/** Market value in the holding's own currency (×100 minor units). */
export function marketValue(shares: number, price: number): number {
  return Math.round((shares * price) / 10000);
}

/** Convert a base-currency-bound minor amount by an FX rate (round to the cent). */
export function toBase(minor: number, fxRate: number): number {
  return Math.round(minor * fxRate);
}

export interface HoldingValue {
  /** Market value in the holding's currency (minor units). */
  valueCur: number;
  /** Unrealized gain in the holding's currency (value − cost). */
  gainCur: number;
  /** Market value in the base currency (TWD, minor units). */
  valueBase: number;
  /** Unrealized gain converted to the base currency at the current rate. */
  gainBase: number;
}

/** Running position on the average-cost method: total shares and the cost
 *  basis of those shares (both in the holding's own units/currency). */
export interface Position {
  shares: number;
  cost: number;
}

/** Add a buy: shares in, cash paid folded into the cost basis. */
export function applyBuy(p: Position, shares: number, cost: number): Position {
  return { shares: p.shares + shares, cost: p.cost + cost };
}

export interface SellResult extends Position {
  /** Cost basis removed with the sold shares (average cost × shares sold). */
  costRemoved: number;
  /** Realized gain on this sell: proceeds − costRemoved. */
  realized: number;
}

/**
 * Apply a sell on the average-cost method. The sold shares carry the current
 * average cost per share; realized gain is proceeds minus that removed basis.
 */
export function applySell(p: Position, shares: number, proceeds: number): SellResult {
  const costRemoved = p.shares > 0 ? Math.round((p.cost * shares) / p.shares) : 0;
  return {
    shares: p.shares - shares,
    cost: p.cost - costRemoved,
    costRemoved,
    realized: proceeds - costRemoved,
  };
}

/** Value one holding, both in its own currency and the base currency. */
export function valueHolding(
  h: Pick<Holding, "shares" | "price" | "cost" | "currency">,
  fx: Record<string, number>,
): HoldingValue {
  const rate = fx[h.currency] ?? 1; // base currency (or unknown) → 1
  const valueCur = marketValue(h.shares, h.price);
  const gainCur = valueCur - h.cost;
  return { valueCur, gainCur, valueBase: toBase(valueCur, rate), gainBase: toBase(gainCur, rate) };
}

export interface ClassTotals {
  valueBase: number;
  gainBase: number;
  realizedBase: number;
}

export interface PortfolioTotals {
  /** Base-currency market value across all holdings. */
  valueBase: number;
  /** Base-currency cost across all holdings. */
  costBase: number;
  /** Base-currency unrealized gain across all holdings. */
  gainBase: number;
  /** Base-currency cumulative realized gain across all holdings. */
  realizedBase: number;
  /** value / unrealized / realized split by holding class. */
  byClass: Record<HoldingClass, ClassTotals>;
}

/** Aggregate holdings into base-currency totals and a growth/dividend split. */
export function portfolioTotals(
  holdings: Pick<Holding, "shares" | "price" | "cost" | "currency" | "class" | "realizedGain">[],
  fx: Record<string, number>,
): PortfolioTotals {
  const byClass: PortfolioTotals["byClass"] = {
    growth: { valueBase: 0, gainBase: 0, realizedBase: 0 },
    dividend: { valueBase: 0, gainBase: 0, realizedBase: 0 },
  };
  let valueBase = 0;
  let costBase = 0;
  let gainBase = 0;
  let realizedBase = 0;
  for (const h of holdings) {
    const v = valueHolding(h, fx);
    const realized = toBase(h.realizedGain ?? 0, fx[h.currency] ?? 1);
    valueBase += v.valueBase;
    gainBase += v.gainBase;
    realizedBase += realized;
    costBase += v.valueBase - v.gainBase;
    byClass[h.class].valueBase += v.valueBase;
    byClass[h.class].gainBase += v.gainBase;
    byClass[h.class].realizedBase += realized;
  }
  return { valueBase, costBase, gainBase, realizedBase, byClass };
}
