import { describe, it, expect } from "vitest";
import { marketValue, toBase, valueHolding, portfolioTotals, applyBuy, applySell } from "./holdings";
import type { HoldingClass } from "../domain/types";

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
