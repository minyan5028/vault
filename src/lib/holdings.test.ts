import { describe, it, expect } from "vitest";
import {
  marketValue,
  toBase,
  valueHolding,
  portfolioTotals,
  applyBuy,
  applySell,
  avgCost,
  dividendMetrics,
  estimatedDividends,
} from "./holdings";
import type { HoldingClass, PortfolioSnapshot, Trade } from "../domain/types";

const h = (
  shares: number,
  price: number,
  cost: number,
  currency: string,
  cls: HoldingClass = "growth",
  realizedGain = 0,
) => ({ shares, price, cost, currency, class: cls, realizedGain });

describe("marketValue", () => {
  it("computes shares×price in minor units (shares ×10000, price ×100)", () => {
    // 15.2506 shares @ $98.53 → $1502.64
    expect(marketValue(152506, 9853)).toBe(150264);
  });
  it("is zero for zero shares", () => {
    expect(marketValue(0, 9853)).toBe(0);
  });
});

describe("toBase", () => {
  it("applies an FX rate and rounds to the cent", () => {
    expect(toBase(150264, 31.5)).toBe(4733316); // USD→TWD
    expect(toBase(150264, 1)).toBe(150264); // base currency
  });
});

describe("valueHolding", () => {
  it("values in currency and base, with gain from cost", () => {
    const v = valueHolding(h(152506, 9853, 132000, "USD"), { USD: 31.5 });
    expect(v.valueCur).toBe(150264);
    expect(v.gainCur).toBe(18264); // 150264 − 132000
    expect(v.valueBase).toBe(toBase(150264, 31.5));
    expect(v.gainBase).toBe(toBase(18264, 31.5));
  });
  it("treats an unknown / base currency as rate 1", () => {
    const v = valueHolding(h(100000, 5000, 400000, "TWD"), {});
    expect(v.valueCur).toBe(50000);
    expect(v.valueBase).toBe(50000);
  });
  it("reports gain as a fraction of cost, null when cost is 0", () => {
    expect(valueHolding(h(50000, 12000, 40000, "TWD"), {}).gainPct).toBeCloseTo(0.5); // 60000 vs 40000
    expect(valueHolding(h(50000, 2703, 0, "USD"), { USD: 31.5 }).gainPct).toBeNull();
  });
});

describe("avgCost", () => {
  it("is cost spread over shares (×100 per share)", () => {
    // $1320 cost over 15 shares → $88.00/share
    expect(avgCost(132000, 150000)).toBe(8800);
  });
  it("is 0 with no shares", () => {
    expect(avgCost(132000, 0)).toBe(0);
  });
});

describe("dividendMetrics", () => {
  const buyDate = new Date("2023-01-15T00:00:00Z");
  const now = new Date("2026-01-15T00:00:00Z").getTime(); // ~3 years later
  const dh = {
    shares: 250000, // 25 shares
    cost: 100000, // $1000
    dividendReceived: 15000, // $150 received
    dividendPerShare: 400, // $4.00/share/yr
    buyDate,
  };

  it("computes cumulative and annualized yield on cost", () => {
    const m = dividendMetrics(dh, 130000, now);
    expect(m.cumulativeYieldOnCost).toBeCloseTo(0.15); // 150 / 1000
    expect(m.annualizedYieldOnCost).toBeCloseTo(0.05, 2); // 0.15 over ~3 yrs
  });

  it("computes projected income and forward/current yields", () => {
    const m = dividendMetrics(dh, 130000, now); // market value $1300
    expect(m.annualIncome).toBe(10000); // 25 × $4 = $100
    expect(m.currentYield).toBeCloseTo(0.0769, 3); // 100 / 1300
    expect(m.forwardYieldOnCost).toBeCloseTo(0.1); // 100 / 1000
  });

  it("nulls fields whose inputs are missing", () => {
    const m = dividendMetrics(
      { shares: 250000, cost: 0, dividendReceived: 0, dividendPerShare: 0, buyDate: null },
      0,
      now,
    );
    expect(m.cumulativeYieldOnCost).toBeNull();
    expect(m.annualizedYieldOnCost).toBeNull();
    expect(m.annualIncome).toBe(0);
    expect(m.currentYield).toBeNull();
    expect(m.forwardYieldOnCost).toBeNull();
  });
});

describe("estimatedDividends", () => {
  const snap = (date: string, shares: number, price: number): PortfolioSnapshot => ({
    date,
    entries: { mo: { shares, price } },
    fx: {},
  });
  const buy = (date: string, shares: number): Pick<Trade, "kind" | "date" | "shares"> => ({
    kind: "buy",
    date: new Date(`${date}T00:00:00`),
    shares,
  });

  it("values share growth not explained by trades at each snapshot's price", () => {
    // Opening buy 18 sh; grows 20 → 22 via DRIP across two snapshots.
    const snaps = [snap("2024-01-31", 200000, 4000), snap("2024-06-30", 220000, 5000)];
    const trades = [buy("2023-01-15", 180000)];
    // 1st: (20 − 0) − 18 = 2 sh @ $40 = $80; 2nd: (22 − 20) − 0 = 2 sh @ $50 = $100
    expect(estimatedDividends("mo", snaps, trades)).toBe(8000 + 10000);
  });

  it("excludes shares added by a later buy (not a dividend)", () => {
    const snaps = [snap("2024-01-31", 180000, 4000), snap("2024-06-30", 250000, 5000)];
    // Bought 5 more shares in the interval; only the remaining 2 sh growth is DRIP.
    const trades = [buy("2023-01-15", 180000), buy("2024-03-01", 50000)];
    // 1st: (18 − 0) − 18 = 0; 2nd: (25 − 18) − 5 = 2 sh @ $50 = $100
    expect(estimatedDividends("mo", snaps, trades)).toBe(10000);
  });

  it("is 0 with no snapshots for the holding", () => {
    expect(estimatedDividends("mo", [], [buy("2023-01-15", 180000)])).toBe(0);
    expect(estimatedDividends("xyz", [snap("2024-01-31", 200000, 4000)], [])).toBe(0);
  });
});

describe("applyBuy", () => {
  it("adds shares and folds cash paid into the cost basis", () => {
    // hold 10 @ cost 1000, buy 10 more for 1400
    expect(applyBuy({ shares: 100000, cost: 100000 }, 100000, 140000)).toEqual({
      shares: 200000,
      cost: 240000,
    });
  });
});

describe("applySell", () => {
  it("removes shares at average cost and realizes the difference", () => {
    // hold 20 @ cost 2400 (avg 120), sell 5 @ 160 → proceeds 800
    const r = applySell({ shares: 200000, cost: 240000 }, 50000, 80000);
    expect(r.costRemoved).toBe(60000); // 240000 × 5/20
    expect(r.realized).toBe(20000); // 80000 − 60000
    expect(r.shares).toBe(150000);
    expect(r.cost).toBe(180000);
  });
  it("realizes a loss when proceeds fall below basis, and can close the position", () => {
    // hold 10 @ cost 1000 (avg 100), sell all 10 @ 80 → proceeds 800
    const r = applySell({ shares: 100000, cost: 100000 }, 100000, 80000);
    expect(r.costRemoved).toBe(100000);
    expect(r.realized).toBe(-20000);
    expect(r.shares).toBe(0);
    expect(r.cost).toBe(0);
  });
});

describe("portfolioTotals", () => {
  it("aggregates to base currency and splits by class", () => {
    const fx = { USD: 30 };
    const totals = portfolioTotals(
      [
        h(100000, 10000, 80000, "USD", "growth", 5000), // value 100000cur, gain 20000, realized 5000
        h(100000, 5000, 60000, "USD", "dividend"), // value 50000cur, gain -10000
        h(100000, 5000, 40000, "TWD", "growth"), // value 50000, gain 10000 (rate 1)
      ],
      fx,
    );
    // growth: (100000*30) + 50000 value ; dividend: 50000*30
    expect(totals.byClass.growth.valueBase).toBe(30 * 100000 + 50000);
    expect(totals.byClass.dividend.valueBase).toBe(30 * 50000);
    expect(totals.valueBase).toBe(30 * 100000 + 50000 + 30 * 50000);
    expect(totals.gainBase).toBe(30 * 20000 + 30 * -10000 + 10000);
    expect(totals.costBase).toBe(totals.valueBase - totals.gainBase);
    expect(totals.realizedBase).toBe(30 * 5000); // one USD holding, realized 5000 @ rate 30
    expect(totals.byClass.growth.realizedBase).toBe(30 * 5000);
  });
});
