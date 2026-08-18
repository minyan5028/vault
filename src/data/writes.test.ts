import { describe, it, expect } from "vitest";
import {
  planAddEvent,
  planSetAutoAssign,
  planBuy,
  planRemoveHolding,
  planRestoreEvent,
  planSell,
  planSnapshot,
  planSoftDeleteEvent,
  planUpdateEvent,
  type HoldingCashLeg,
  type NewTransactionInput,
} from "./writes";
import type { StoredEventFields } from "../lib/ledgerEffect";
import type { Holding } from "../domain/types";

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
  const holding: Holding = {
    id: "hold-1",
    ticker: "VT",
    name: null,
    class: "growth",
    currency: "TWD",
    cost: 100_000,
    shares: 100_0000, // 100 shares (×10000)
    price: 1200,
    pricedAt: null,
    realizedGain: 0,
    dividendReceived: 0,
    dividendPerShare: 0,
    targetPrice: null,
    buyDate: null,
    archived: false,
    sortOrder: 0,
  };

  it("increments shares and cost, and pays from the cash account", () => {
    const { ops } = planBuy(
      L,
      holding,
      { shares: 10_0000, price: 1300, amount: 13_000, date: JUL, cashAccountId: "cash" },
      "uid-1",
      { tradeId: "trade-1", transferId: "tx-1" },
    );
    expect(ops[0]).toEqual({
      kind: "update",
      path: ["ledgers", L, "holdings", "hold-1"],
      data: { shares: inc(10_0000), cost: inc(13_000), price: 1300, pricedAt: at(JUL) },
    });
    expect(ops[1]).toMatchObject({ path: ["ledgers", L, "holdings", "hold-1", "trades", "trade-1"] });
    // The cash leg debits cash and credits the holding endpoint.
    expect(ops[3]).toMatchObject({ data: { netFlow: { cash: inc(-13_000), "hold-1": inc(13_000) } } });
  });

  it("records no cash leg when none was chosen", () => {
    const { ops } = planBuy(
      L,
      holding,
      { shares: 10_0000, price: 1300, amount: 13_000, date: JUL, cashAccountId: null },
      "uid-1",
      { tradeId: "trade-1" },
    );
    expect(ops).toHaveLength(2);
  });

  it("removes shares at average cost and banks the realized gain", () => {
    // Half the position: cost basis 50,000; sold for 60,000 → +10,000 realized.
    const { ops } = planSell(
      L,
      holding,
      { shares: 50_0000, price: 1200, amount: 60_000, date: JUL, cashAccountId: "cash" },
      "uid-1",
      { tradeId: "trade-1", transferId: "tx-1" },
    );
    expect(ops[0]).toMatchObject({
      data: { shares: inc(-50_0000), cost: inc(-50_000), realizedGain: inc(10_000) },
    });
    expect(ops[1]).toMatchObject({ data: { kind: "sell", realized: 10_000 } });
    // Proceeds move from the holding endpoint back to cash.
    expect(ops[3]).toMatchObject({ data: { netFlow: { "hold-1": inc(-60_000), cash: inc(60_000) } } });
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
