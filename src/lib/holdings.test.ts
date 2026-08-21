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
  replayTrades,
  openingBuyDate,
  positionAsOf,
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

describe("replayTrades", () => {
  const t = (over: Partial<Trade> & Pick<Trade, "id" | "kind">): Trade => ({
    date: new Date(2026, 0, 1),
    shares: 0,
    price: 0,
    amount: 0,
    realized: 0,
    ...over,
  });
  const buy = (id: string, date: Date, shares: number, amount: number) =>
    t({ id, kind: "buy", date, shares, amount });
  const sell = (id: string, date: Date, shares: number, amount: number) =>
    t({ id, kind: "sell", date, shares, amount });

  const JAN = new Date(2026, 0, 10);
  const FEB = new Date(2026, 1, 10);
  const MAR = new Date(2026, 2, 10);

  it("folds buys into traded shares and cost basis", () => {
    const r = replayTrades([buy("a", JAN, 10_0000, 100_000), buy("b", FEB, 5_0000, 60_000)]);
    expect(r).toMatchObject({ ok: true, tradedShares: 15_0000, cost: 160_000, realizedGain: 0 });
  });

  it("removes shares at the average cost at that moment and banks the gain", () => {
    // 100 shares for 100,000 → avg 1,000. Sell 50 for 60,000 → +10,000 realized.
    const r = replayTrades([buy("a", JAN, 100_0000, 100_000), sell("b", FEB, 50_0000, 60_000)]);
    expect(r).toMatchObject({ ok: true, tradedShares: 50_0000, cost: 50_000, realizedGain: 10_000 });
  });

  it("re-prices a later sell when an earlier buy changes — the whole point of a fold", () => {
    const dearer = replayTrades([buy("a", JAN, 100_0000, 200_000), sell("b", FEB, 50_0000, 60_000)]);
    expect(dearer).toMatchObject({ ok: true, tradedShares: 50_0000, cost: 100_000, realizedGain: -40_000 });
  });

  it("replays in date order regardless of the order given", () => {
    const trades = [sell("b", FEB, 50_0000, 60_000), buy("a", JAN, 100_0000, 100_000)];
    expect(replayTrades(trades)).toEqual(replayTrades([...trades].reverse()));
  });

  it("puts a buy before a sell on the same date — you cannot sell what you have not bought", () => {
    const sameDay = [sell("b", JAN, 50_0000, 60_000), buy("a", JAN, 100_0000, 100_000)];
    expect(replayTrades(sameDay)).toMatchObject({
      ok: true,
      tradedShares: 50_0000,
      cost: 50_000,
      realizedGain: 10_000,
    });
  });

  it("orders same-date same-kind trades by id, so the basis is reproducible", () => {
    const a = [buy("a", JAN, 10_0000, 10_000), buy("b", JAN, 10_0000, 30_000)];
    expect(replayTrades(a)).toEqual(replayTrades([...a].reverse()));
  });

  it("excludes soft-deleted trades", () => {
    const r = replayTrades([
      buy("a", JAN, 10_0000, 100_000),
      { ...buy("b", FEB, 5_0000, 60_000), deletedAt: MAR },
    ]);
    expect(r).toMatchObject({ ok: true, tradedShares: 10_0000, cost: 100_000, realizedGain: 0 });
  });

  it("refuses a replay that would sell shares that were never bought", () => {
    const r = replayTrades([buy("a", JAN, 10_0000, 100_000), sell("b", FEB, 50_0000, 60_000)]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a refusal");
    expect(r.blockedBy.id).toBe("b");
    expect(r.remaining).toBe(-40_0000);
  });

  it("names the first trade that breaks, not the last", () => {
    const r = replayTrades([
      buy("a", JAN, 10_0000, 100_000),
      sell("b", FEB, 50_0000, 60_000),
      sell("c", MAR, 90_0000, 90_000),
    ]);
    if (r.ok) throw new Error("expected a refusal");
    expect(r.blockedBy.id).toBe("b");
  });

  it("allows selling the position down to exactly zero", () => {
    const r = replayTrades([buy("a", JAN, 10_0000, 100_000), sell("b", FEB, 10_0000, 120_000)]);
    expect(r).toMatchObject({ ok: true, tradedShares: 0, cost: 0, realizedGain: 20_000 });
  });

  it("attributes realized gain to the sell that produced it", () => {
    const r = replayTrades([
      buy("a", JAN, 100_0000, 100_000),
      sell("b", FEB, 50_0000, 60_000),
      sell("c", MAR, 50_0000, 40_000),
    ]);
    if (!r.ok) throw new Error("expected a successful replay");
    expect(r.realizedByTrade.get("b")).toBe(10_000);
    expect(r.realizedByTrade.get("c")).toBe(-10_000);
    expect(r.realizedByTrade.has("a")).toBe(false);
  });

  describe("a sell apportioned against what was really held", () => {
    it("divides the basis by the frozen count, not by what was bought", () => {
      // Bought 10 for 100,000; reinvestment grew it to 30; sold 20 of those 30.
      // Two thirds of the position leaves, so two thirds of the basis leaves.
      const r = replayTrades([
        buy("a", JAN, 10_0000, 100_000),
        { ...sell("b", FEB, 20_0000, 90_000), basisShares: 30_0000 },
      ]);
      expect(r).toMatchObject({
        ok: true,
        tradedShares: 10_0000,
        cost: 33_333,
        realizedGain: 90_000 - 66_667,
      });
    });

    it("empties the basis when the whole position goes, over two sales", () => {
      const r = replayTrades([
        buy("a", JAN, 10_0000, 100_000),
        { ...sell("b", FEB, 20_0000, 90_000), basisShares: 30_0000 },
        { ...sell("c", MAR, 10_0000, 45_000), basisShares: 10_0000 },
      ]);
      expect(r).toMatchObject({ ok: true, tradedShares: 0, cost: 0 });
    });

    it("takes the whole basis when a reinvested position is closed in one go", () => {
      const r = replayTrades([
        buy("a", JAN, 15_0000, 100_000),
        { ...sell("b", FEB, 15_2506, 150_000), basisShares: 15_2506 },
      ]);
      expect(r).toMatchObject({ ok: true, tradedShares: 0, cost: 0, realizedGain: 50_000 });
    });

    it("still refuses a sell beyond even the frozen count", () => {
      const r = replayTrades([
        buy("a", JAN, 10_0000, 100_000),
        { ...sell("b", FEB, 40_0000, 90_000), basisShares: 30_0000 },
      ]);
      if (r.ok) throw new Error("expected a refusal");
      expect(r.remaining).toBe(-10_0000);
    });

    it("behaves exactly as before for a sell that carries no frozen count", () => {
      const legacy = replayTrades([buy("a", JAN, 100_0000, 100_000), sell("b", FEB, 50_0000, 60_000)]);
      const framed = replayTrades([
        buy("a", JAN, 100_0000, 100_000),
        { ...sell("b", FEB, 50_0000, 60_000), basisShares: 100_0000 },
      ]);
      expect(legacy).toEqual(framed);
    });
  });

  it("folds an empty log to an empty position", () => {
    expect(replayTrades([])).toMatchObject({ ok: true, tradedShares: 0, cost: 0, realizedGain: 0 });
  });
});

describe("openingBuyDate", () => {
  const buy = (id: string, date: Date, over: Partial<Trade> = {}): Trade => ({
    id,
    kind: "buy",
    date,
    shares: 10_0000,
    price: 100,
    amount: 1_000,
    realized: 0,
    ...over,
  });
  const JAN = new Date(2026, 0, 10);
  const FEB = new Date(2026, 1, 10);

  it("is the earliest surviving buy", () => {
    expect(openingBuyDate([buy("b", FEB), buy("a", JAN)])).toEqual(JAN);
  });

  it("ignores sells — a position opens when it is bought", () => {
    const sell: Trade = { ...buy("s", JAN), kind: "sell" };
    expect(openingBuyDate([sell, buy("b", FEB)])).toEqual(FEB);
  });

  it("moves to the next buy when the earliest is soft-deleted", () => {
    expect(openingBuyDate([buy("a", JAN, { deletedAt: FEB }), buy("b", FEB)])).toEqual(FEB);
  });

  it("is null when no buy survives", () => {
    expect(openingBuyDate([buy("a", JAN, { deletedAt: FEB })])).toBeNull();
    expect(openingBuyDate([])).toBeNull();
  });
});

describe("positionAsOf", () => {
  const t = (id: string, kind: "buy" | "sell", date: Date, shares: number, amount: number): Trade => ({
    id,
    kind,
    date,
    shares,
    price: 0,
    amount,
    realized: 0,
  });
  const JAN = new Date(2026, 0, 10);
  const JUN = new Date(2026, 5, 10);

  it("ignores trades recorded after the date asked about", () => {
    const log = [t("a", "buy", JAN, 10_0000, 100_000), t("b", "buy", JUN, 10_0000, 300_000)];
    expect(positionAsOf(log, new Date(2026, 2, 1))).toMatchObject({
      tradedShares: 10_0000,
      cost: 100_000,
    });
  });

  it("includes a trade on the date itself", () => {
    const log = [t("a", "buy", JAN, 10_0000, 100_000)];
    expect(positionAsOf(log, JAN)).toMatchObject({ tradedShares: 10_0000 });
  });
});
