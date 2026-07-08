import { describe, it, expect } from "vitest";
import { monthContribution, addContribution, rollupsFrom, type RollupContribution } from "./rollup";
import { UNCATEGORIZED, type EventType } from "../domain/types";

const t = (type: EventType, baseAmount: number, categoryId: string | null = null) => ({
  type,
  baseAmount,
  categoryId,
});

describe("monthContribution", () => {
  it("adds expense to the total and its category", () => {
    expect(monthContribution(t("expense", 300, "food"), 1)).toEqual({
      income: 0,
      expense: 300,
      expenseByCategory: { food: 300 },
      incomeByCategory: {},
    });
  });

  it("adds income to the total and its category", () => {
    expect(monthContribution(t("income", 5000, "salary"), 1)).toEqual({
      income: 5000,
      expense: 0,
      expenseByCategory: {},
      incomeByCategory: { salary: 5000 },
    });
  });

  it("ignores transfers (they are not income or expense)", () => {
    expect(monthContribution(t("transfer", 200), 1)).toBeNull();
  });

  it("buckets a null category under UNCATEGORIZED", () => {
    expect(monthContribution(t("expense", 100, null), 1)).toEqual({
      income: 0,
      expense: 100,
      expenseByCategory: { [UNCATEGORIZED]: 100 },
      incomeByCategory: {},
    });
  });

  it("negates every field when reversing (sign -1)", () => {
    expect(monthContribution(t("expense", 300, "food"), -1)).toEqual({
      income: 0,
      expense: -300,
      expenseByCategory: { food: -300 },
      incomeByCategory: {},
    });
  });
});

describe("addContribution", () => {
  it("merges contributions into the same month and category", () => {
    const acc = new Map<string, RollupContribution>();
    addContribution(acc, "2026-07", monthContribution(t("expense", 300, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 200, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 50, "transport"), 1));
    expect(acc.get("2026-07")).toEqual({
      income: 0,
      expense: 550,
      expenseByCategory: { food: 500, transport: 50 },
      incomeByCategory: {},
    });
  });

  it("keeps months separate and skips nulls", () => {
    const acc = new Map<string, RollupContribution>();
    addContribution(acc, "2026-06", monthContribution(t("income", 5000, "salary"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 300, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("transfer", 200), 1));
    expect(acc.get("2026-06")?.income).toBe(5000);
    expect(acc.get("2026-07")?.expense).toBe(300);
    expect(acc.size).toBe(2);
  });

  it("an apply then reverse nets to zero", () => {
    const acc = new Map<string, RollupContribution>();
    addContribution(acc, "2026-07", monthContribution(t("expense", 300, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 300, "food"), -1));
    expect(acc.get("2026-07")).toEqual({
      income: 0,
      expense: 0,
      expenseByCategory: { food: 0 },
      incomeByCategory: {},
    });
  });
});

describe("rollupsFrom", () => {
  it("builds absolute per-month rollups, excluding transfers", () => {
    const rollups = rollupsFrom([
      { ...t("income", 5000, "salary"), yearMonth: "2026-07" },
      { ...t("expense", 300, "food"), yearMonth: "2026-07" },
      { ...t("expense", 120, "food"), yearMonth: "2026-07" },
      { ...t("transfer", 999), yearMonth: "2026-07" },
      { ...t("expense", 80, "transport"), yearMonth: "2026-06" },
    ]);
    expect(rollups.get("2026-07")).toEqual({
      yearMonth: "2026-07",
      income: 5000,
      expense: 420,
      expenseByCategory: { food: 420 },
      incomeByCategory: { salary: 5000 },
    });
    expect(rollups.get("2026-06")?.expense).toBe(80);
  });
});
