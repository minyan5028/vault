import { describe, it, expect } from "vitest";
import {
  accountDeltas,
  effectOn,
  netFlowByAccount,
  depositsWithdrawals,
  runningBalances,
  pruneZeroDeltas,
} from "./balance";
import type { EventType, Transaction } from "../domain/types";

function tx(p: {
  id?: string;
  type: EventType;
  accountId: string;
  toAccountId?: string | null;
  baseAmount: number;
  toAmount?: number;
}): Transaction {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    type: p.type,
    amount: p.baseAmount,
    currency: "TWD",
    toAmount: p.toAmount ?? p.baseAmount,
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

describe("accountDeltas", () => {
  it("income credits, expense debits the source account", () => {
    expect(accountDeltas({ type: "income", accountId: "a", toAccountId: null, amount: 500 }, 1)).toEqual({ a: 500 });
    expect(accountDeltas({ type: "expense", accountId: "a", toAccountId: null, amount: 300 }, 1)).toEqual({ a: -300 });
  });
  it("transfer debits source and credits destination", () => {
    expect(
      accountDeltas({ type: "transfer", accountId: "a", toAccountId: "b", amount: 200 }, 1),
    ).toEqual({ a: -200, b: 200 });
  });
  it("cross-currency transfer credits the destination its own toAmount", () => {
    // 42,240 TWD out of a; 1,320 USD into b
    expect(
      accountDeltas(
        { type: "transfer", accountId: "a", toAccountId: "b", amount: 42240, toAmount: 132000 },
        1,
      ),
    ).toEqual({ a: -42240, b: 132000 });
  });
  it("reverses with sign -1 — the holding-deletion cash reversal", () => {
    // undo a buy (cash → holding): cash returns, holding endpoint zeroes out
    expect(
      accountDeltas({ type: "transfer", accountId: "cash", toAccountId: "dis", amount: 132000 }, -1),
    ).toEqual({ cash: 132000, dis: -132000 });
  });
});

describe("pruneZeroDeltas", () => {
  // Regression guard for the 2026-08-01 rollup wipe: a delta that cancels out
  // must be reported as "nothing moved", because persisting it as an empty
  // netFlow map erases every account's balance (see rollupDelta).
  const cancels = (deltas: Record<string, number>) =>
    Object.keys(pruneZeroDeltas(deltas)).length === 0;

  it("keeps accounts that actually move", () => {
    expect(pruneZeroDeltas({ a: -300, b: 300 })).toEqual({ a: -300, b: 300 });
    expect(pruneZeroDeltas({ a: -300, b: 0 })).toEqual({ a: -300 });
  });

  it("reports a same-account transfer as no movement", () => {
    expect(cancels(accountDeltas({ type: "transfer", accountId: "a", toAccountId: "a", amount: 500 }, 1))).toBe(true);
  });

  it("reports a zero amount as no movement", () => {
    expect(cancels(accountDeltas({ type: "expense", accountId: "a", toAccountId: null, amount: 0 }, 1))).toBe(true);
    expect(cancels(accountDeltas({ type: "transfer", accountId: "a", toAccountId: "b", amount: 0 }, 1))).toBe(true);
  });

  it("reports an edit that leaves amount and accounts alone as no movement", () => {
    // What update() computes when only the title/category/date changed.
    const old = { type: "expense" as EventType, accountId: "a", toAccountId: null, amount: 500 };
    const deltas: Record<string, number> = {};
    for (const m of [accountDeltas(old, -1), accountDeltas({ ...old }, 1)])
      for (const [k, v] of Object.entries(m)) deltas[k] = (deltas[k] ?? 0) + v;
    expect(deltas).toEqual({ a: 0 }); // non-empty, so a key-count guard is not enough
    expect(cancels(deltas)).toBe(true);
  });

  it("still reports movement when an edit changes the amount", () => {
    const old = { type: "expense" as EventType, accountId: "a", toAccountId: null, amount: 500 };
    const deltas: Record<string, number> = {};
    for (const m of [accountDeltas(old, -1), accountDeltas({ ...old, amount: 600 }, 1)])
      for (const [k, v] of Object.entries(m)) deltas[k] = (deltas[k] ?? 0) + v;
    expect(pruneZeroDeltas(deltas)).toEqual({ a: -100 });
  });
});

describe("effectOn", () => {
  it("signs by type relative to the account", () => {
    expect(effectOn(tx({ type: "income", accountId: "a", baseAmount: 500 }), "a")).toBe(500);
    expect(effectOn(tx({ type: "expense", accountId: "a", baseAmount: 300 }), "a")).toBe(-300);
    const transfer = tx({ type: "transfer", accountId: "a", toAccountId: "b", baseAmount: 200 });
    expect(effectOn(transfer, "a")).toBe(-200); // out of source
    expect(effectOn(transfer, "b")).toBe(200); // into destination
    expect(effectOn(transfer, "c")).toBe(0); // unrelated
  });
  it("moves each account by its own currency on a cross-currency transfer", () => {
    // Debit 42,240 TWD from a; credit 1,320 USD to b (toAmount differs).
    const xfer = tx({ type: "transfer", accountId: "a", toAccountId: "b", baseAmount: 42240, toAmount: 132000 });
    expect(effectOn(xfer, "a")).toBe(-42240); // source in TWD
    expect(effectOn(xfer, "b")).toBe(132000); // destination in USD
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
