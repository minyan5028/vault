/**
 * Pure valuation math for holdings (see the Holding domain type). Kept free of
 * Firestore so it can be unit-tested. Money is ×100 minor units; `shares` is
 * ×10000 (4 decimals). `fx` maps a currency to its rate into the base currency
 * (TWD); the base currency itself is treated as rate 1.
 */
import type { Holding, HoldingClass, PortfolioSnapshot, Trade } from "../domain/types";
import { toDateInputValue } from "./date";

/** Market value in the holding's own currency (×100 minor units). */
export function marketValue(shares: number, price: number): number {
  return Math.round((shares * price) / 10000);
}

/** Convert a base-currency-bound minor amount by an FX rate (round to the cent). */
export function toBase(minor: number, fxRate: number): number {
  return Math.round(minor * fxRate);
}

/**
 * Rate to convert `currency` into the base (TWD). Base is 1:1. A foreign
 * currency uses its known rate, or **0 if none is set** — so an un-priced
 * foreign balance contributes 0 to net worth rather than being counted 1:1
 * (which would silently inflate the total by treating it as TWD).
 */
export function rateToBase(currency: string, fx: Record<string, number>): number {
  return currency === "TWD" ? 1 : (fx[currency] ?? 0);
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
  /** Unrealized gain as a fraction of cost (0.12 = +12%), or null if cost is 0
   *  (e.g. a spun-off holding) where a percentage is undefined. */
  gainPct: number | null;
}

/** Average cost per share (×100 minor units), or 0 with no shares. */
export function avgCost(cost: number, shares: number): number {
  return shares > 0 ? Math.round((cost * 10000) / shares) : 0;
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
  const rate = rateToBase(h.currency, fx);
  const valueCur = marketValue(h.shares, h.price);
  const gainCur = valueCur - h.cost;
  return {
    valueCur,
    gainCur,
    valueBase: toBase(valueCur, rate),
    gainBase: toBase(gainCur, rate),
    gainPct: h.cost > 0 ? gainCur / h.cost : null,
  };
}

/**
 * Dividend metrics for a holding — reference figures that do NOT feed net worth
 * (the position is already market-valued; DRIP is reflected in `shares`). All
 * ratios are fractions (0.045 = 4.5%); money is ×100 minor units, holding
 * currency. Split into two views:
 *
 *  - Backward (realized): what the manually-tracked cumulative `dividendReceived`
 *    represents against cost — total, and annualized over the holding period.
 *  - Forward (expected): from the user's `dividendPerShare` (annual $/share) ×
 *    current shares — projected annual income, current yield (vs market value)
 *    and forward yield on cost.
 *
 * A field is null when its inputs are missing (no cost, no buy date, no
 * per-share figure), so the UI can hide what it can't compute.
 */
export interface DividendMetrics {
  /** dividendReceived / cost. */
  cumulativeYieldOnCost: number | null;
  /** cumulativeYieldOnCost spread over years held (buyDate → now). */
  annualizedYieldOnCost: number | null;
  /** Projected annual income: dividendPerShare × shares (minor units). */
  annualIncome: number;
  /** annualIncome / current market value. */
  currentYield: number | null;
  /** annualIncome / cost. */
  forwardYieldOnCost: number | null;
}

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** A return figure as a fraction of cost — total, and spread over the years
 *  held (buyDate → now). Each is null when its inputs are missing. */
export function yieldOnCost(
  amount: number,
  cost: number,
  buyDate: Date | null,
  now: number,
): { onCost: number | null; annualized: number | null } {
  const onCost = cost > 0 ? amount / cost : null;
  let annualized: number | null = null;
  if (onCost != null && buyDate) {
    const years = (now - buyDate.getTime()) / YEAR_MS;
    if (years > 0) annualized = onCost / years;
  }
  return { onCost, annualized };
}

export function dividendMetrics(
  h: Pick<Holding, "shares" | "cost" | "dividendReceived" | "dividendPerShare" | "buyDate">,
  valueCur: number,
  now: number,
): DividendMetrics {
  const { onCost, annualized } = yieldOnCost(h.dividendReceived ?? 0, h.cost, h.buyDate, now);
  const annualIncome = marketValue(h.shares, h.dividendPerShare ?? 0);
  return {
    cumulativeYieldOnCost: onCost,
    annualizedYieldOnCost: annualized,
    annualIncome,
    currentYield: valueCur > 0 && annualIncome > 0 ? annualIncome / valueCur : null,
    forwardYieldOnCost: h.cost > 0 && annualIncome > 0 ? annualIncome / h.cost : null,
  };
}

/**
 * Estimated dividends reinvested (DRIP) for one holding, reverse-derived from
 * valuation snapshots. DRIP dividends are never recorded as cash — they surface
 * as share growth. Walking the snapshots in date order, the share increase in
 * each interval that is NOT explained by recorded trades (buys/sells) is taken
 * as reinvested dividend and valued at that snapshot's price. Trades before the
 * first snapshot (e.g. the opening buy) are netted out, so pre-snapshot DRIP is
 * still captured at the first available price.
 *
 * Approximate by nature (snapshot prices stand in for the exact reinvestment
 * price) and reference-only — it never feeds cost or net worth. Returns 0 when
 * the holding has no snapshots. Result is ×100 minor units, holding currency.
 */
export function estimatedDividends(
  holdingId: string,
  snapshots: Pick<PortfolioSnapshot, "date" | "entries">[],
  trades: Pick<Trade, "kind" | "date" | "shares">[],
): number {
  const points = snapshots
    .map((s) => ({ date: s.date, e: s.entries[holdingId] }))
    .filter((p): p is { date: string; e: PortfolioSnapshot["entries"][string] } => !!p.e)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length === 0) return 0;

  const signed = trades.map((t) => ({
    date: toDateInputValue(t.date),
    shares: t.kind === "buy" ? t.shares : -t.shares,
  }));

  let prevShares = 0;
  let prevDate = ""; // exclusive lower bound; "" = open (catches the opening buy)
  let dividend = 0;
  for (const p of points) {
    const tradeShares = signed
      .filter((s) => (prevDate === "" || s.date > prevDate) && s.date <= p.date)
      .reduce((sum, s) => sum + s.shares, 0);
    const drip = p.e.shares - prevShares - tradeShares;
    if (drip > 0) dividend += marketValue(drip, p.e.price);
    prevShares = p.e.shares;
    prevDate = p.date;
  }
  return dividend;
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
    const realized = toBase(h.realizedGain ?? 0, rateToBase(h.currency, fx));
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

/**
 * The position a trade log adds up to: what was bought, what it cost, and what
 * selling has banked so far.
 *
 * `tradedShares` is what the owner *bought* — not what they hold. Reinvestment
 * grows the broker's count without any trade behind it, so held shares live on
 * the Holding and come from snapshots (ADR-0010). The two are equal only for a
 * position that has never reinvested.
 */
export interface ReplayedPosition {
  tradedShares: number;
  cost: number;
  realizedGain: number;
  /** Realized gain attributed to each sell, by trade id. A sell's realized
   *  figure is a fold output, not an input: editing an earlier buy re-prices
   *  it, so the stored copy on the trade has to be rewritten with it. */
  realizedByTrade: ReadonlyMap<string, number>;
}

/**
 * A replay either adds up or it does not. When a sell reaches further back than
 * the buys can support, the fold names the trade it broke on and by how much,
 * so a refused correction can say *which* trade to fix first rather than
 * failing generically.
 */
export type ReplayResult =
  | ({ ok: true } & ReplayedPosition)
  | { ok: false; blockedBy: Trade; remaining: number };

/**
 * Replay order. Date first, then buys before sells, then id.
 *
 * The middle rule is domain, not tie-breaking: a same-day buy and sell can only
 * have happened in that order, because the shares had to exist before they were
 * sold. Id last makes the order total, so the same log always folds to the same
 * basis — average cost is path-dependent, and a wobbly order would make the
 * cost basis irreproducible.
 */
function replayOrder(a: Trade, b: Trade): number {
  const byDate = a.date.getTime() - b.date.getTime();
  if (byDate !== 0) return byDate;
  if (a.kind !== b.kind) return a.kind === "buy" ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * Fold a holding's trade log into its cost basis and realized gain.
 *
 * This is the only route to those two numbers (ADR-0010): they are recomputed
 * from the surviving trades rather than patched incrementally, which is what
 * makes a trade correctable at all. Editing an early buy re-prices every later
 * sell, because average cost is path-dependent — that is the intended
 * consequence, not a side effect.
 *
 * Soft-deleted trades are excluded (ADR-0004).
 */
export function replayTrades(trades: readonly Trade[]): ReplayResult {
  const log = trades.filter((t) => !t.deletedAt).sort(replayOrder);
  let position: Position = { shares: 0, cost: 0 };
  let realizedGain = 0;
  const realizedByTrade = new Map<string, number>();

  for (const t of log) {
    if (t.kind === "buy") {
      position = applyBuy(position, t.shares, t.amount);
      continue;
    }
    if (t.shares > position.shares) {
      return { ok: false, blockedBy: t, remaining: position.shares - t.shares };
    }
    const r = applySell(position, t.shares, t.amount);
    position = { shares: r.shares, cost: r.cost };
    realizedGain += r.realized;
    realizedByTrade.set(t.id, r.realized);
  }

  return {
    ok: true,
    tradedShares: position.shares,
    cost: position.cost,
    realizedGain,
    realizedByTrade,
  };
}
