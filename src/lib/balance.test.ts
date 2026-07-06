import { describe, it, expect } from "vitest";
import { effectOn, netFlowByAccount, depositsWithdrawals, runningBalances } from "./balance";
import type { EventType, Transaction } from "../domain/types";

function tx(p: {
  id?: string;
  type: EventType;
  accountId: string;
  toAccountId?: string | null;
  baseAmount: number;
}): Transaction {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    type: p.type,
    amount: p.baseAmount,
    currency: "TWD",
    baseAmount: p.baseAmount,
    baseCurrency: "TWD",
    fxRate: 1,
    date: new Date(),
    yearMonth: "2026-07",
    categoryId: null,
    accountId: p.accountId,
    toAccountId: p.toAccountId ?? null,
    title: "",
    note: null,
    createdBy: "u",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe("effectOn", () => {
  it("signs by type relative to the account", () => {
    expect(effectOn(tx({ type: "income", accountId: "a", baseAmount: 500 }), "a")).toBe(500);
    expect(effectOn(tx({ type: "expense", accountId: "a", baseAmount: 300 }), "a")).toBe(-300);
    const transfer = tx({ type: "transfer", accountId: "a", toAccountId: "b", baseAmount: 200 });
    expect(effectOn(transfer, "a")).toBe(-200); // out of source
    expect(effectOn(transfer, "b")).toBe(200); // into destination
    expect(effectOn(transfer, "c")).toBe(0); // unrelated
  });
});

describe("netFlowByAccount", () => {
  it("nets income, expense and both legs of transfers", () => {
    const m = netFlowByAccount([
      tx({ type: "income", accountId: "a", baseAmount: 500 }),
      tx({ type: "expense", accountId: "a", baseAmount: 300 }),
      tx({ type: "transfer", accountId: "a", toAccountId: "b", baseAmount: 200 }),
    ]);
    expect(m.get("a")).toBe(0); // 500 - 300 - 200
    expect(m.get("b")).toBe(200);
  });
});

describe("depositsWithdrawals", () => {
  it("splits in vs out for one account", () => {
    const txns = [
      tx({ type: "income", accountId: "a", baseAmount: 500 }),
      tx({ type: "expense", accountId: "a", baseAmount: 300 }),
      tx({ type: "transfer", accountId: "a", toAccountId: "b", baseAmount: 200 }),
      tx({ type: "transfer", accountId: "c", toAccountId: "a", baseAmount: 50 }),
    ];
    expect(depositsWithdrawals(txns, "a")).toEqual({ deposits: 550, withdrawals: 500 });
  });
});

describe("runningBalances", () => {
  it("cumulates from the start balance in order", () => {
    const t1 = tx({ id: "t1", type: "income", accountId: "a", baseAmount: 500 });
    const t2 = tx({ id: "t2", type: "expense", accountId: "a", baseAmount: 300 });
    const map = runningBalances([t1, t2], "a", 1000);
    expect(map.get("t1")).toBe(1500);
    expect(map.get("t2")).toBe(1200);
  });
});
