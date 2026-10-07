import { describe, it, expect } from "vitest";
import {
  planAddEvent,
  planSetAutoAssign,
  planAddHolding,
  planBuy,
  planRemoveHolding,
  planRestoreEvent,
  planSell,
  planSnapshot,
  planSoftDeleteEvent,
  planUpdateEvent,
  planDeleteTrade,
  planEditTrade,
  type HoldingCashLeg,
  type NewTransactionInput,
  type TradeWriteResult,
} from "./writes";
import type { StoredEventFields } from "../lib/ledgerEffect";
import type { Trade } from "../domain/types";
import type { WritePlan } from "./writePlan";

const L = "ledger-1";
const JUL = new Date(2026, 6, 15); // local, so yearMonthOf gives "2026-07"
const AUG = new Date(2026, 7, 3);

const inc = (by: number) => ({ $: "increment", by });
const serverTime = { $: "serverTime" };
const at = (d: Date) => ({ $: "time", ms: d.getTime() });

const balancesPath = ["ledgers", L, "meta", "balances"];
const rollupPath = (ym: string) => ["ledgers", L, "rollups", ym];

const newExpense = (over: Partial<NewTransactionInput> = {}): NewTransactionInput => ({
  type: "expense",
  amount: 300,
  currency: "TWD",
  baseAmount: 300,
  baseCurrency: "TWD",
  fxRate: 1,
  date: JUL,
  categoryId: "food",
  projectId: null,
  accountId: "cash",
  toAccountId: null,
  title: "lunch",
  note: null,
  createdBy: "uid-1",
  ...over,
});

const storedExpense = (over: Partial<StoredEventFields> = {}): StoredEventFields => ({
  type: "expense",
  accountId: "cash",
  toAccountId: null,
  amount: 300,
  toAmount: 300,
  baseAmount: 300,
  fxRate: 1,
  categoryId: "food",
  yearMonth: "2026-07",
  ...over,
});

describe("planAddEvent", () => {
  it("writes the event, the balance rollup and the month rollup", () => {
    const { ops } = planAddEvent(L, "tx-1", newExpense());
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({
      kind: "set",
      path: ["ledgers", L, "transactions", "tx-1"],
    });
    expect(ops[1]).toEqual({
      kind: "set",
      path: balancesPath,
      data: { netFlow: { cash: inc(-300) } },
      merge: true,
    });
    expect(ops[2]).toEqual({
      kind: "set",
      path: rollupPath("2026-07"),
      data: {
        yearMonth: "2026-07",
        updatedAt: serverTime,
        expense: inc(300),
        expenseByCategory: { food: inc(300) },
      },
      merge: true,
    });
  });

  it("stores the event document with server timestamps and a derived yearMonth", () => {
    const { ops } = planAddEvent(L, "tx-1", newExpense());
    expect(ops[0].kind === "set" && ops[0].data).toEqual({
      type: "expense",
      amount: 300,
      currency: "TWD",
      toAmount: 300,
      baseAmount: 300,
      baseCurrency: "TWD",
      fxRate: 1,
      date: at(JUL),
      yearMonth: "2026-07",
      categoryId: "food",
      projectId: null,
      accountId: "cash",
      toAccountId: null,
      title: "lunch",
      note: null,
      createdBy: "uid-1",
      createdAt: serverTime,
      updatedAt: serverTime,
      deletedAt: null,
    });
  });

  it("touches no month rollup for a transfer", () => {
    const { ops } = planAddEvent(
      L,
      "tx-1",
      newExpense({ type: "transfer", toAccountId: "bank", categoryId: null }),
    );
    expect(ops).toHaveLength(2);
    expect(ops[1]).toEqual({
      kind: "set",
      path: balancesPath,
      data: { netFlow: { cash: inc(-300), bank: inc(300) } },
      merge: true,
    });
  });

  it("credits a cross-currency transfer's destination its own toAmount", () => {
    const { ops } = planAddEvent(
      L,
      "tx-1",
      newExpense({ type: "transfer", toAccountId: "usd", toAmount: 10, categoryId: null }),
    );
    expect(ops[1]).toMatchObject({ data: { netFlow: { cash: inc(-300), usd: inc(10) } } });
  });
});

describe("planSoftDeleteEvent / planRestoreEvent", () => {
  it("marks deleted and reverses both rollups", () => {
    const { ops } = planSoftDeleteEvent(L, "tx-1", storedExpense());
    expect(ops[0]).toEqual({
      kind: "update",
      path: ["ledgers", L, "transactions", "tx-1"],
      data: { deletedAt: serverTime, updatedAt: serverTime },
    });
    expect(ops[1]).toMatchObject({ data: { netFlow: { cash: inc(300) } } });
    expect(ops[2]).toMatchObject({ data: { expense: inc(-300) } });
  });

  it("clears deletedAt and re-applies both rollups", () => {
    const { ops } = planRestoreEvent(L, "tx-1", storedExpense());
    expect(ops[0]).toMatchObject({ kind: "update", data: { deletedAt: null } });
    expect(ops[1]).toMatchObject({ data: { netFlow: { cash: inc(-300) } } });
    expect(ops[2]).toMatchObject({ data: { expense: inc(300) } });
  });
});

describe("planUpdateEvent", () => {
  const active = { deleted: false };

  it("nets the balance and month change for an amount edit", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { amount: 500 }, active);
    expect(ops[0]).toMatchObject({ kind: "update", data: { amount: 500, updatedAt: serverTime } });
    expect(ops[1]).toMatchObject({ data: { netFlow: { cash: inc(-200) } } });
    expect(ops[2]).toMatchObject({ data: { expense: inc(200) } });
  });

  it("re-derives baseAmount from amount × fxRate rather than the stored figure", () => {
    // A foreign-currency event whose stored baseAmount is 900 (300 × 3).
    const stored = storedExpense({ amount: 300, baseAmount: 900, fxRate: 3 });
    const { ops } = planUpdateEvent(L, "tx-1", stored, { amount: 500 }, active);
    // The month rollup must move by 1500 − 900, not by the stored 900.
    expect(ops[2]).toMatchObject({ data: { expense: inc(600) } });
  });

  it("splits into two month rollups when the date crosses a boundary", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { date: AUG }, active);
    expect(ops[0]).toMatchObject({ data: { date: at(AUG), yearMonth: "2026-08" } });
    // No balance op — moving the date alone moves no money.
    expect(ops.filter((o) => o.path.join("/") === balancesPath.join("/"))).toHaveLength(0);
    expect(ops[1]).toMatchObject({ path: rollupPath("2026-07"), data: { expense: inc(-300) } });
    expect(ops[2]).toMatchObject({ path: rollupPath("2026-08"), data: { expense: inc(300) } });
  });

  it("moves the month total between categories when the category changes", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { categoryId: "transport" }, active);
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({
      data: { expenseByCategory: { food: inc(-300), transport: inc(300) } },
    });
  });

  it("skips undefined patch values, which Firestore would reject", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { toAmount: undefined }, active);
    expect(ops[0]).toEqual({
      kind: "update",
      path: ["ledgers", L, "transactions", "tx-1"],
      data: { updatedAt: serverTime },
    });
  });

  it("writes only the field change when the edit moves no money — the 2026-08-01 rollup wipe", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { title: "brunch" }, active);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "update", data: { title: "brunch" } });
  });

  it("writes only the field change when editing a soft-deleted event", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { amount: 900 }, { deleted: true });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "update", data: { amount: 900 } });
  });
});

describe("planRemoveHolding", () => {
  const leg = (txId: string, over: Partial<StoredEventFields> = {}): HoldingCashLeg => ({
    txId,
    event: {
      type: "transfer",
      accountId: "cash",
      toAccountId: "hold-1",
      amount: 1000,
      toAmount: 1000,
      baseAmount: 1000,
      categoryId: null,
      yearMonth: "2026-07",
      ...over,
    },
  });

  it("soft-deletes each leg, reverses once, then deletes the trades and the holding", () => {
    const { ops } = planRemoveHolding(L, "hold-1", [leg("tx-1")], ["trade-1", "trade-2"]);
    expect(ops.map((o) => o.kind)).toEqual(["update", "set", "delete", "delete", "delete"]);
    expect(ops[0]).toMatchObject({ path: ["ledgers", L, "transactions", "tx-1"] });
    expect(ops[1]).toEqual({
      kind: "set",
      path: balancesPath,
      data: { netFlow: { cash: inc(1000), "hold-1": inc(-1000) } },
      merge: true,
    });
    expect(ops[4]).toEqual({ kind: "delete", path: ["ledgers", L, "holdings", "hold-1"] });
  });

  it("combines every leg into a single rollup write", () => {
    const { ops } = planRemoveHolding(
      L,
      "hold-1",
      [leg("tx-1"), leg("tx-2", { amount: 400, toAmount: 400 })],
      [],
    );
    const rollupWrites = ops.filter((o) => o.path.join("/") === balancesPath.join("/"));
    expect(rollupWrites).toHaveLength(1);
    expect(rollupWrites[0]).toMatchObject({
      data: { netFlow: { cash: inc(1400), "hold-1": inc(-1400) } },
    });
  });

  it("writes no rollup at all when the legs net to zero", () => {
    const buy = leg("tx-1");
    const sell = leg("tx-2", { accountId: "hold-1", toAccountId: "cash" });
    const { ops } = planRemoveHolding(L, "hold-1", [buy, sell], []);
    expect(ops.filter((o) => o.kind === "set")).toHaveLength(0);
    expect(ops.map((o) => o.kind)).toEqual(["update", "update", "delete"]);
  });
});

describe("planBuy / planSell", () => {
  const holding = { id: "hold-1", ticker: "VT", currency: "TWD", pricedAt: null };
  // 100 shares bought for 100,000 — the log the new trade joins.
  const opening: Trade = {
    id: "trade-0",
    kind: "buy",
    date: new Date(2026, 0, 5),
    shares: 100_0000,
    price: 1000,
    amount: 100_000,
    realized: 0,
  };
  const ctx = { trades: [opening], latestSnapshot: null, heldShares: 100_0000 };
  const ok = (r: TradeWriteResult) => {
    if (!r.ok) throw new Error("expected a plan, got a refusal");
    return r.plan.ops;
  };

  it("folds the cost basis absolute and pays from the cash account", () => {
    const ops = ok(
      planBuy(
        L,
        holding,
        ctx,
        { shares: 10_0000, price: 1300, amount: 13_000, date: JUL, cashAccountId: "cash" },
        "uid-1",
        { tradeId: "trade-1", transferId: "tx-1" },
      ),
    );
    expect(ops[0]).toEqual({
      kind: "update",
      path: ["ledgers", L, "holdings", "hold-1"],
      data: {
        cost: 113_000,
        realizedGain: 0,
        buyDate: at(new Date(2026, 0, 5)),
        // A new trade is also a price observation for its day, folded into the
        // same document write rather than a second one.
        price: 1300,
        pricedAt: at(JUL),
        shares: inc(10_0000),
      },
    });
    expect(ops[1]).toMatchObject({ path: ["ledgers", L, "holdings", "hold-1", "trades", "trade-1"] });
    expect(ops[3]).toMatchObject({ data: { netFlow: { cash: inc(-13_000), "hold-1": inc(13_000) } } });
  });

  it("records no cash leg when none was chosen", () => {
    const ops = ok(
      planBuy(
        L,
        holding,
        ctx,
        { shares: 10_0000, price: 1300, amount: 13_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(ops).toHaveLength(2);
  });

  it("removes shares at average cost and banks the realized gain", () => {
    // Half the position: cost basis 50,000; sold for 60,000 → +10,000 realized.
    const ops = ok(
      planSell(
        L,
        holding,
        ctx,
        { shares: 50_0000, price: 1200, amount: 60_000, date: JUL, cashAccountId: "cash" },
        "uid-1",
        { tradeId: "trade-1", transferId: "tx-1" },
      ),
    );
    expect(ops[0]).toMatchObject({
      data: { cost: 50_000, realizedGain: 10_000, shares: inc(-50_0000) },
    });
    expect(ops[1]).toMatchObject({ data: { kind: "sell", realized: 10_000 } });
    expect(ops[3]).toMatchObject({ data: { netFlow: { "hold-1": inc(-60_000), cash: inc(60_000) } } });
  });

  it("refreshes the price, because a trade observes the market on its day", () => {
    const ops = ok(
      planBuy(
        L,
        { ...holding, pricedAt: new Date(2026, 5, 1) },
        ctx,
        { shares: 10_0000, price: 1300, amount: 13_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(ops[0]).toMatchObject({ data: { price: 1300, pricedAt: at(JUL) } });
  });

  it("leaves the price alone for a backdated trade — recording a missed 2024 buy", () => {
    const old = new Date(2024, 2, 1);
    const ops = ok(
      planBuy(
        L,
        { ...holding, pricedAt: new Date(2026, 7, 1) },
        ctx,
        { shares: 10_0000, price: 300, amount: 3_000, date: old, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(ops[0]).not.toHaveProperty("data.price");
    expect(ops[0]).not.toHaveProperty("data.pricedAt");
  });

  it("refuses a sell of more shares than were ever bought", () => {
    const r = planSell(
      L,
      holding,
      ctx,
      { shares: 200_0000, price: 1200, amount: 240_000, date: JUL, cashAccountId: "cash" },
      "uid-1",
      { tradeId: "trade-1", transferId: "tx-1" },
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a refusal");
    expect(r.remaining).toBe(-100_0000);
  });

  it("uses traded shares, not the DRIP-grown held count, for the average cost", () => {
    // The holding's own `shares` is irrelevant to the fold — only the log counts.
    const ops = ok(
      planSell(
        L,
        holding,
        ctx,
        { shares: 50_0000, price: 1200, amount: 60_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(ops[0]).toMatchObject({ data: { cost: 50_000 } });
  });
});

describe("a trade knows its cash leg", () => {
  const holding = { id: "hold-1", ticker: "VT", currency: "TWD", pricedAt: null };
  const ctx = { trades: [] as Trade[], latestSnapshot: null, heldShares: 0 };
  const buy = { shares: 10_0000, price: 1300, amount: 13_000, date: JUL };

  const tradeDoc = (r: TradeWriteResult) => {
    if (!r.ok) throw new Error("expected a plan, got a refusal");
    const op = r.plan.ops.find((o) => o.path.includes("trades"));
    if (!op || op.kind === "delete") throw new Error("no trade document in the plan");
    return op.data as Record<string, unknown>;
  };
  const openingTradeDoc = (ops: WritePlan["ops"]) => {
    const op = ops.find((o) => o.path.includes("trades"));
    if (!op || op.kind === "delete") throw new Error("no trade document in the plan");
    return op.data as Record<string, unknown>;
  };

  it("names the transfer a buy paid through", () => {
    const r = planBuy(L, holding, ctx, { ...buy, cashAccountId: "cash" }, "uid-1", {
      tradeId: "trade-1",
      transferId: "tx-1",
    });
    expect(tradeDoc(r).transferId).toBe("tx-1");
  });

  it("names the transfer a sell's proceeds landed in", () => {
    const opened = {
      trades: [
        {
          id: "trade-0",
          kind: "buy" as const,
          date: new Date(2026, 0, 5),
          shares: 100_0000,
          price: 1000,
          amount: 100_000,
          realized: 0,
        },
      ],
      latestSnapshot: null,
      heldShares: 100_0000,
    };
    const r = planSell(
      L,
      holding,
      opened,
      { shares: 50_0000, price: 1200, amount: 60_000, date: JUL, cashAccountId: "cash" },
      "uid-1",
      { tradeId: "trade-1", transferId: "tx-1" },
    );
    expect(tradeDoc(r).transferId).toBe("tx-1");
  });

  it("records null — not a missing field — for a trade deliberately kept off-cash", () => {
    const r = planBuy(L, holding, ctx, { ...buy, cashAccountId: null }, "uid-1", {
      tradeId: "trade-1",
    });
    const data = tradeDoc(r);
    expect(data.transferId).toBeNull();
    expect("transferId" in data).toBe(true);
  });

  it("records null when an id was allocated but no cash account chosen", () => {
    const r = planBuy(L, holding, ctx, { ...buy, cashAccountId: null }, "uid-1", {
      tradeId: "trade-1",
      transferId: "tx-unused",
    });
    expect(tradeDoc(r).transferId).toBeNull();
  });

  it("names the funding transfer on a new holding's opening buy", () => {
    const { ops } = planAddHolding(
      L,
      "hold-2",
      {
        ticker: "VOO",
        name: null,
        class: "growth",
        currency: "TWD",
        cost: 13_000,
        shares: 10_0000,
        price: 1300,
        targetPrice: null,
        dividendPerShare: 0,
        buyDate: JUL,
        fundingAccountId: "cash",
      },
      "uid-1",
      { tradeId: "trade-1", transferId: "tx-1" },
    );
    expect(openingTradeDoc(ops).transferId).toBe("tx-1");
  });

  it("records null on a standalone holding's opening buy", () => {
    const { ops } = planAddHolding(
      L,
      "hold-2",
      {
        ticker: "VOO",
        name: null,
        class: "growth",
        currency: "TWD",
        cost: 13_000,
        shares: 10_0000,
        price: 1300,
        targetPrice: null,
        dividendPerShare: 0,
        buyDate: JUL,
        fundingAccountId: null,
      },
      "uid-1",
      { tradeId: "trade-1" },
    );
    expect(openingTradeDoc(ops).transferId).toBeNull();
  });
});

describe("selling a position the log only partly accounts for", () => {
  const holding = { id: "hold-1", ticker: "DIS", currency: "USD", pricedAt: null };
  // Bought 15; reinvestment grew the broker's count to 15.2506.
  const opening: Trade = {
    id: "trade-0",
    kind: "buy",
    date: new Date(2026, 0, 5),
    shares: 15_0000,
    price: 8800,
    amount: 132_000,
    realized: 0,
  };
  const ok = (r: TradeWriteResult) => {
    if (!r.ok) throw new Error("expected a plan, got a refusal");
    return r.plan.ops;
  };
  const tradeDoc = (ops: WritePlan["ops"]) => {
    const op = ops.find((o) => o.path.includes("trades"));
    if (!op || op.kind === "delete") throw new Error("no trade document");
    return op.data as Record<string, unknown>;
  };

  it("closes a reinvested position, taking the whole basis with it", () => {
    const ops = ok(
      planSell(
        L,
        holding,
        { trades: [opening], latestSnapshot: null, heldShares: 15_2506 },
        { shares: 15_2506, price: 10_000, amount: 152_506, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(tradeDoc(ops).basisShares).toBe(15_2506);
    expect(ops[0]).toMatchObject({ data: { cost: 0, realizedGain: 152_506 - 132_000 } });
  });

  it("apportions a partial sale against what was really held, not what was bought", () => {
    // Bought 10 for 100,000, reinvested up to 30, sold 20 — two thirds of the
    // position, so two thirds of the basis.
    const bought10: Trade = { ...opening, shares: 10_0000, amount: 100_000 };
    const ops = ok(
      planSell(
        L,
        holding,
        { trades: [bought10], latestSnapshot: null, heldShares: 30_0000 },
        { shares: 20_0000, price: 4_500, amount: 90_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(tradeDoc(ops).basisShares).toBe(30_0000);
    expect(ops[0]).toMatchObject({ data: { cost: 33_333, realizedGain: 90_000 - 66_667 } });
  });

  it("takes the log's word when a recent buy outruns the last snapshot", () => {
    const ops = ok(
      planSell(
        L,
        holding,
        { trades: [opening], latestSnapshot: null, heldShares: 5_0000 },
        { shares: 15_0000, price: 10_000, amount: 150_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect(tradeDoc(ops).basisShares).toBe(15_0000);
  });

  it("still refuses a sale beyond both counts", () => {
    const r = planSell(
      L,
      holding,
      { trades: [opening], latestSnapshot: null, heldShares: 15_2506 },
      { shares: 40_0000, price: 10_000, amount: 400_000, date: JUL, cashAccountId: null },
      "uid-1",
      { tradeId: "trade-1" },
    );
    if (r.ok) throw new Error("expected a refusal");
    expect(r.remaining).toBe(15_2506 - 40_0000);
  });

  it("records no denominator on a buy — it means nothing there", () => {
    const ops = ok(
      planBuy(
        L,
        holding,
        { trades: [opening], latestSnapshot: null, heldShares: 15_2506 },
        { shares: 1_0000, price: 10_000, amount: 10_000, date: JUL, cashAccountId: null },
        "uid-1",
        { tradeId: "trade-1" },
      ),
    );
    expect("basisShares" in tradeDoc(ops)).toBe(false);
  });

  it("keeps a sell's frozen denominator when its figures are corrected", () => {
    const sold: Trade = {
      id: "t-sell",
      kind: "sell",
      date: new Date(2026, 1, 10),
      shares: 20_0000,
      price: 4_500,
      amount: 90_000,
      realized: 23_333,
      basisShares: 30_0000,
    };
    const bought10: Trade = { ...opening, shares: 10_0000, amount: 100_000 };
    const ops = ok(
      planEditTrade(
        L,
        "hold-1",
        { trades: [bought10, sold], latestSnapshot: null, heldShares: 10_0000 },
        "t-sell",
        { amount: 120_000 },
        null,
      ),
    );
    // Apportioned against 30 still — the position was that size when it sold,
    // and today's lower held count does not rewrite that history.
    expect(ops[0]).toMatchObject({ data: { cost: 33_333, realizedGain: 120_000 - 66_667 } });
  });
});

describe("planEditTrade / planDeleteTrade", () => {
  const H = "hold-1";
  const JAN = new Date(2026, 0, 10);
  const FEB = new Date(2026, 1, 10);
  const MAR = new Date(2026, 2, 10);

  const openingBuy: Trade = {
    id: "t-buy",
    kind: "buy",
    date: JAN,
    shares: 100_0000,
    price: 1000,
    amount: 100_000,
    realized: 0,
    transferId: "tx-buy",
  };
  const laterSell: Trade = {
    id: "t-sell",
    kind: "sell",
    date: FEB,
    shares: 50_0000,
    price: 1200,
    amount: 60_000,
    realized: 10_000,
    transferId: "tx-sell",
  };

  const leg = (txId: string, amount: number, accountId: string, toAccountId: string): HoldingCashLeg => ({
    txId,
    event: {
      type: "transfer",
      accountId,
      toAccountId,
      amount,
      toAmount: amount,
      baseAmount: amount,
      fxRate: 1,
      categoryId: null,
      yearMonth: "2026-01",
    },
  });
  const buyLeg = leg("tx-buy", 100_000, "cash", H);

  const ok = (r: TradeWriteResult) => {
    if (!r.ok) throw new Error("expected a plan, got a refusal");
    return r.plan.ops;
  };
  const holdingOp = (ops: WritePlan["ops"]) => {
    const op = ops.find((o) => o.path.length === 4 && o.path[2] === "holdings");
    if (!op || op.kind === "delete") throw new Error("no holding update in the plan");
    return op.data as Record<string, unknown>;
  };
  const opAt = (ops: WritePlan["ops"], path: readonly string[]) => {
    const op = ops.find((o) => o.path.join("/") === path.join("/"));
    if (!op || op.kind === "delete") throw new Error(`no write at ${path.join("/")}`);
    return op.data as Record<string, unknown>;
  };
  const tradePath = (id: string) => ["ledgers", L, "holdings", H, "trades", id];

  it("recomputes cost by replaying the log, not by applying a delta", () => {
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { amount: 130_000 },
        buyLeg,
      ),
    );
    expect(holdingOp(ops)).toMatchObject({ cost: 130_000, realizedGain: 0 });
  });

  it("re-prices a later sell when the buy before it changes", () => {
    // Buy 100 for 200,000 (avg 2,000); the Feb sell of 50 for 60,000 now loses
    // 40,000 instead of gaining 10,000.
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { amount: 200_000 },
        buyLeg,
      ),
    );
    expect(holdingOp(ops)).toMatchObject({ cost: 100_000, realizedGain: -40_000 });
    expect(opAt(ops, tradePath("t-sell"))).toEqual({ realized: -40_000 });
  });

  it("writes the corrected fields onto the trade itself", () => {
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { date: MAR, shares: 90_0000, price: 1100, amount: 99_000 },
        buyLeg,
      ),
    );
    expect(opAt(ops, tradePath("t-buy"))).toEqual({
      date: at(MAR),
      shares: 90_0000,
      price: 1100,
      amount: 99_000,
      realized: 0,
      updatedAt: serverTime,
    });
  });

  it("never moves the displayed price — that belongs to the snapshots", () => {
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { price: 9999 },
        buyLeg,
      ),
    );
    expect(holdingOp(ops)).not.toHaveProperty("price");
    expect(holdingOp(ops)).not.toHaveProperty("pricedAt");
  });

  describe("held shares follow the snapshot boundary", () => {
    it("moves held shares for a trade the snapshots have not yet seen", () => {
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy], latestSnapshot: new Date(2026, 0, 1), heldShares: 100_0000 },
          "t-buy",
          { shares: 90_0000 },
          buyLeg,
        ),
      );
      expect(holdingOp(ops).shares).toEqual(inc(-10_0000));
    });

    it("leaves held shares alone for a trade a later snapshot has superseded", () => {
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy], latestSnapshot: FEB, heldShares: 100_0000 },
          "t-buy",
          { shares: 90_0000 },
          buyLeg,
        ),
      );
      expect(holdingOp(ops)).not.toHaveProperty("shares");
    });

    it("counts a snapshot's own date as already read — it is an end-of-day position", () => {
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy], latestSnapshot: JAN, heldShares: 100_0000 },
          "t-buy",
          { shares: 90_0000 },
          buyLeg,
        ),
      );
      expect(holdingOp(ops)).not.toHaveProperty("shares");
    });

    it("takes the contribution with it when a correction crosses the boundary", () => {
      // Dated before the snapshot, so contributing nothing; moved after it, so
      // it must now stand in for a reading that has not happened.
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy], latestSnapshot: FEB, heldShares: 100_0000 },
          "t-buy",
          { date: MAR },
          buyLeg,
        ),
      );
      expect(holdingOp(ops).shares).toEqual(inc(100_0000));
    });
  });

  it("moves the cash leg with the money and the date", () => {
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { amount: 130_000, date: MAR },
        buyLeg,
      ),
    );
    const legWrite = opAt(ops, ["ledgers", L, "transactions", "tx-buy"]);
    expect(legWrite).toMatchObject({ amount: 130_000, toAmount: 130_000, baseAmount: 130_000 });
    // The extra 30,000 leaves cash and lands on the holding endpoint.
    expect(opAt(ops, balancesPath)).toEqual({
      netFlow: { cash: inc(-30_000), [H]: inc(30_000) },
    });
  });

  it("changes the trade only when its cash-leg link is unknown", () => {
    const legacy: Trade = { ...openingBuy, transferId: undefined };
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [legacy], latestSnapshot: null, heldShares: 100_0000 },
        "t-buy",
        { amount: 130_000 },
        null,
      ),
    );
    expect(ops.some((o) => o.path.includes("transactions"))).toBe(false);
    expect(ops.some((o) => o.path.join("/") === balancesPath.join("/"))).toBe(false);
  });

  it("refuses a correction that would sell shares that were never bought", () => {
    const r = planEditTrade(
      L,
      H,
      { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 },
      "t-buy",
      { shares: 10_0000 },
      buyLeg,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a refusal");
    expect(r.blockedBy.id).toBe("t-sell");
    expect(r.remaining).toBe(-40_0000);
  });

  it("soft-deletes a trade rather than removing the document", () => {
    const ops = ok(
      planDeleteTrade(L, H, { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 }, "t-sell",
        leg("tx-sell", 60_000, H, "cash")),
    );
    expect(opAt(ops, tradePath("t-sell"))).toEqual({
      deletedAt: serverTime,
      updatedAt: serverTime,
    });
    expect(ops.every((o) => o.kind !== "delete")).toBe(true);
  });

  it("drops a deleted trade from the fold and reverses its cash leg exactly once", () => {
    const ops = ok(
      planDeleteTrade(L, H, { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 }, "t-sell",
        leg("tx-sell", 60_000, H, "cash")),
    );
    // Back to the whole opening position, with nothing realized.
    expect(holdingOp(ops)).toMatchObject({ cost: 100_000, realizedGain: 0 });
    expect(opAt(ops, ["ledgers", L, "transactions", "tx-sell"])).toEqual({
      deletedAt: serverTime,
      updatedAt: serverTime,
    });
    expect(opAt(ops, balancesPath)).toEqual({
      netFlow: { [H]: inc(60_000), cash: inc(-60_000) },
    });
  });

  it("gives back what a deleted trade was contributing to held shares", () => {
    const ops = ok(
      planDeleteTrade(
        L,
        H,
        { trades: [openingBuy], latestSnapshot: new Date(2026, 0, 1), heldShares: 100_0000 },
        "t-buy",
        buyLeg,
      ),
    );
    expect(holdingOp(ops).shares).toEqual(inc(-100_0000));
  });

  it("refuses a deletion that would strand a later sell", () => {
    const r = planDeleteTrade(
      L,
      H,
      { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 },
      "t-buy",
      buyLeg,
    );
    if (r.ok) throw new Error("expected a refusal");
    expect(r.blockedBy.id).toBe("t-sell");
  });

  describe("the purchase date is the log's, not a second copy", () => {
    it("follows a correction to the opening buy's date", () => {
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
          "t-buy",
          { date: MAR },
          buyLeg,
        ),
      );
      expect(holdingOp(ops).buyDate).toEqual(at(MAR));
    });

    it("stays on the earliest buy when a later one is corrected", () => {
      const later: Trade = { ...openingBuy, id: "t-buy-2", date: MAR };
      const ops = ok(
        planEditTrade(
          L,
          H,
          { trades: [openingBuy, later], latestSnapshot: null, heldShares: 100_0000 },
          "t-buy-2",
          { amount: 5_000 },
          null,
        ),
      );
      expect(holdingOp(ops).buyDate).toEqual(at(JAN));
    });

    it("moves to the next surviving buy when the earliest is deleted", () => {
      const later: Trade = { ...openingBuy, id: "t-buy-2", date: MAR };
      const ops = ok(
        planDeleteTrade(
          L,
          H,
          { trades: [openingBuy, later], latestSnapshot: null, heldShares: 100_0000 },
          "t-buy",
          buyLeg,
        ),
      );
      expect(holdingOp(ops).buyDate).toEqual(at(MAR));
    });

    it("is null when no buy survives", () => {
      const ops = ok(
        planDeleteTrade(L, H, { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 }, "t-buy", buyLeg),
      );
      expect(holdingOp(ops).buyDate).toBeNull();
    });

    it("moves back when a new buy predates the opening one", () => {
      const ops = ok(
        planBuy(
          L,
          { id: H, ticker: "VT", currency: "TWD", pricedAt: null },
          { trades: [openingBuy], latestSnapshot: null, heldShares: 100_0000 },
          { shares: 10_0000, price: 900, amount: 9_000, date: new Date(2025, 11, 1), cashAccountId: null },
          "uid-1",
          { tradeId: "t-new" },
        ),
      );
      expect(holdingOp(ops).buyDate).toEqual(at(new Date(2025, 11, 1)));
    });
  });

  it("reproduces an untouched holding's stored figures — the fold agrees with the increments", () => {
    // What planBuy/planSell built incrementally for this log: cost 50,000 and
    // 10,000 realized. A no-op correction must land on exactly those.
    const ops = ok(
      planEditTrade(
        L,
        H,
        { trades: [openingBuy, laterSell], latestSnapshot: null, heldShares: 100_0000 },
        "t-sell",
        {},
        null,
      ),
    );
    expect(holdingOp(ops)).toMatchObject({ cost: 50_000, realizedGain: 10_000 });
  });
});

describe("planSnapshot", () => {
  it("merges the snapshot, refreshes each holding and merges FX", () => {
    const { ops } = planSnapshot(
      L,
      { date: "2026-07-31", entries: { "hold-1": { price: 1300, shares: 100_0000 } }, fx: { USD: 31 } },
      JUL,
    );
    expect(ops[0]).toEqual({
      kind: "set",
      path: ["ledgers", L, "snapshots", "2026-07-31"],
      data: {
        date: "2026-07-31",
        entries: { "hold-1": { price: 1300, shares: 100_0000 } },
        fx: { USD: 31 },
      },
      merge: true,
    });
    expect(ops[1]).toEqual({
      kind: "update",
      path: ["ledgers", L, "holdings", "hold-1"],
      data: { price: 1300, shares: 100_0000, pricedAt: at(JUL) },
    });
    expect(ops[2]).toEqual({
      kind: "set",
      path: ["ledgers", L, "meta", "fx"],
      data: { rates: { USD: 31 } },
      merge: true,
    });
  });

  // A merge-set treats an empty map as a value, not as "nothing to merge": it
  // replaces the stored map. The TWD group carries no rate, so writing its
  // `fx: {}` erased the USD rate from meta/fx and from the same-date snapshot.
  it("writes no FX at all for a base-currency group", () => {
    const { ops } = planSnapshot(
      L,
      { date: "2026-07-31", entries: { "hold-1": { price: 11615, shares: 200_0000 } }, fx: {} },
      JUL,
    );
    expect(ops[0]).toMatchObject({ kind: "set", path: ["ledgers", L, "snapshots", "2026-07-31"] });
    expect(ops[0]).not.toHaveProperty("data.fx");
    expect(ops.some((o) => o.path.join("/") === ["ledgers", L, "meta", "fx"].join("/"))).toBe(false);
  });

  it("leaves holdings outside the entries untouched", () => {
    const { ops } = planSnapshot(L, { date: "2026-07-31", entries: {}, fx: {} }, JUL);
    expect(ops.filter((o) => o.kind === "update")).toHaveLength(0);
  });
});

describe("planSetAutoAssign", () => {
  const projectPath = (id: string) => ["ledgers", L, "projects", id];
  const projects = [
    { id: "tokyo", autoAssign: false },
    { id: "reno", autoAssign: true },
    { id: "wedding", autoAssign: false },
  ];

  it("turns the chosen project on and the previously-on project off, in one plan", () => {
    const { ops } = planSetAutoAssign(L, projects, "tokyo", true);
    expect(ops).toEqual([
      { kind: "update", path: projectPath("reno"), data: { autoAssign: false, updatedAt: serverTime } },
      { kind: "update", path: projectPath("tokyo"), data: { autoAssign: true, updatedAt: serverTime } },
    ]);
  });

  it("touches only the named project when nothing else was auto-assigning", () => {
    const none = projects.map((p) => ({ ...p, autoAssign: false }));
    const { ops } = planSetAutoAssign(L, none, "tokyo", true);
    expect(ops).toEqual([
      { kind: "update", path: projectPath("tokyo"), data: { autoAssign: true, updatedAt: serverTime } },
    ]);
  });

  it("turning one off leaves every other project alone", () => {
    const { ops } = planSetAutoAssign(L, projects, "reno", false);
    expect(ops).toEqual([
      { kind: "update", path: projectPath("reno"), data: { autoAssign: false, updatedAt: serverTime } },
    ]);
  });

  it("never leaves two projects auto-assigning, even from an inconsistent start", () => {
    const broken = [
      { id: "tokyo", autoAssign: true },
      { id: "reno", autoAssign: true },
    ];
    const { ops } = planSetAutoAssign(L, broken, "wedding", true);
    const left = ops.filter((o) => o.kind === "update" && o.data.autoAssign === true);
    expect(left).toHaveLength(1);
    expect(left[0].path).toEqual(projectPath("wedding"));
  });
});

describe("a Financial Event carrying a Project", () => {
  const monthData = (ops: readonly { kind: string; path: readonly string[]; data?: unknown }[], ym: string) =>
    ops.find((o) => o.path.join("/") === rollupPath(ym).join("/"))?.data as Record<string, unknown>;

  it("adds an expense to its Project's expense total", () => {
    const { ops } = planAddEvent(L, "tx-1", newExpense({ projectId: "tokyo" }));
    expect(monthData(ops, "2026-07")).toMatchObject({
      expense: inc(300),
      expenseByCategory: { food: inc(300) },
      expenseByProject: { tokyo: inc(300) },
    });
  });

  it("adds an income to its Project's income total, kept apart from expense", () => {
    const { ops } = planAddEvent(
      L,
      "tx-1",
      newExpense({ type: "income", categoryId: "refund", projectId: "wedding" }),
    );
    const d = monthData(ops, "2026-07");
    expect(d).toMatchObject({ income: inc(300), incomeByProject: { wedding: inc(300) } });
    expect(d).not.toHaveProperty("expenseByProject");
  });

  it("adds a transfer to no total at all — buying foreign cash is not spending it", () => {
    const { ops } = planAddEvent(
      L,
      "tx-1",
      newExpense({ type: "transfer", categoryId: null, toAccountId: "jpy", projectId: "tokyo" }),
    );
    expect(monthData(ops, "2026-07")).toBeUndefined();
  });

  it("writes no Project key for everyday spending", () => {
    const { ops } = planAddEvent(L, "tx-1", newExpense());
    expect(monthData(ops, "2026-07")).not.toHaveProperty("expenseByProject");
  });

  it("stores projectId on the event document", () => {
    const { ops } = planAddEvent(L, "tx-1", newExpense({ projectId: "tokyo" }));
    const doc = ops.find((o) => o.path.join("/").endsWith("transactions/tx-1"))!;
    expect((doc as { data: Record<string, unknown> }).data.projectId).toBe("tokyo");
  });

  it("attaches a Project to an event recorded earlier", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense(), { projectId: "tokyo" }, { deleted: false });
    expect(monthData(ops, "2026-07")).toMatchObject({ expenseByProject: { tokyo: inc(300) } });
  });

  it("detaches a Project — a change that moves no money is still a change", () => {
    // The amount and the category are identical on both sides, so the only
    // thing moving is the Project. If the zero-check misses the Project maps
    // this plan comes back with no rollup write at all and the figure silently
    // keeps its old value.
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense({ projectId: "tokyo" }), { projectId: null }, { deleted: false });
    expect(monthData(ops, "2026-07")).toMatchObject({ expenseByProject: { tokyo: inc(-300) } });
  });

  it("moves both breakdowns when an edit changes Category and Project together", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense({ projectId: "tokyo" }),
      { categoryId: "travel", projectId: "wedding" },
      { deleted: false },
    );
    expect(monthData(ops, "2026-07")).toMatchObject({
      expenseByCategory: { food: inc(-300), travel: inc(300) },
      expenseByProject: { tokyo: inc(-300), wedding: inc(300) },
    });
  });

  it("splits across two months when a Project event moves over a boundary", () => {
    const { ops } = planUpdateEvent(L, "tx-1", storedExpense({ projectId: "tokyo" }),
      { date: AUG },
      { deleted: false },
    );
    expect(monthData(ops, "2026-07")).toMatchObject({ expenseByProject: { tokyo: inc(-300) } });
    expect(monthData(ops, "2026-08")).toMatchObject({ expenseByProject: { tokyo: inc(300) } });
  });

  it("reverses the Project total when the event is soft-deleted", () => {
    const { ops } = planSoftDeleteEvent(L, "tx-1", storedExpense({ projectId: "tokyo" }));
    expect(monthData(ops, "2026-07")).toMatchObject({ expenseByProject: { tokyo: inc(-300) } });
  });
});
