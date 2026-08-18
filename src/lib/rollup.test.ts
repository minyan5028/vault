import { describe, it, expect } from "vitest";
import {
  monthContribution,
  addContribution,
  rollupsFrom,
  everydayExpense,
  everydayIncome,
  projectTotals,
  type RollupContribution,
} from "./rollup";
import { UNCATEGORIZED, emptyBreakdowns, type EventType } from "../domain/types";

/** A whole contribution, naming only the maps a case is about. Every other
 *  dimension comes back empty, so adding one later does not touch these. */
const contribution = (over: Partial<RollupContribution>): RollupContribution => ({
  income: 0,
  expense: 0,
  ...emptyBreakdowns(),
  ...over,
});

const t = (type: EventType, baseAmount: number, categoryId: string | null = null) => ({
  type,
  baseAmount,
  categoryId,
  projectId: null,
});

describe("monthContribution", () => {
  it("adds expense to the total and its category", () => {
    expect(monthContribution(t("expense", 300, "food"), 1)).toEqual(contribution({
      income: 0,
      expense: 300,
      expenseByCategory: { food: 300 },
      incomeByCategory: {},
    }));
  });

  it("adds income to the total and its category", () => {
    expect(monthContribution(t("income", 5000, "salary"), 1)).toEqual(contribution({
      income: 5000,
      expense: 0,
      expenseByCategory: {},
      incomeByCategory: { salary: 5000 },
    }));
  });

  it("ignores transfers (they are not income or expense)", () => {
    expect(monthContribution(t("transfer", 200), 1)).toBeNull();
  });

  it("buckets a null category under UNCATEGORIZED", () => {
    expect(monthContribution(t("expense", 100, null), 1)).toEqual(contribution({
      income: 0,
      expense: 100,
      expenseByCategory: { [UNCATEGORIZED]: 100 },
      incomeByCategory: {},
    }));
  });

  it("negates every field when reversing (sign -1)", () => {
    expect(monthContribution(t("expense", 300, "food"), -1)).toEqual(contribution({
      income: 0,
      expense: -300,
      expenseByCategory: { food: -300 },
      incomeByCategory: {},
    }));
  });
});

describe("addContribution", () => {
  it("merges contributions into the same month and category", () => {
    const acc = new Map<string, RollupContribution>();
    addContribution(acc, "2026-07", monthContribution(t("expense", 300, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 200, "food"), 1));
    addContribution(acc, "2026-07", monthContribution(t("expense", 50, "transport"), 1));
    expect(acc.get("2026-07")).toEqual(contribution({
      income: 0,
      expense: 550,
      expenseByCategory: { food: 500, transport: 50 },
      incomeByCategory: {},
    }));
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
    expect(acc.get("2026-07")).toEqual(contribution({
      income: 0,
      expense: 0,
      expenseByCategory: { food: 0 },
      incomeByCategory: {},
    }));
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
      ...contribution({
        income: 5000,
        expense: 420,
        expenseByCategory: { food: 420 },
        incomeByCategory: { salary: 5000 },
      }),
    });
    expect(rollups.get("2026-06")?.expense).toBe(80);
  });
});

describe("Projects as a breakdown dimension", () => {
  const p = (type: EventType, baseAmount: number, categoryId: string | null, projectId: string | null) => ({
    type,
    baseAmount,
    categoryId,
    projectId,
  });

  it("buckets an expense under its Project as well as its Category", () => {
    expect(monthContribution(p("expense", 300, "food", "tokyo"), 1)).toEqual(
      contribution({
        expense: 300,
        expenseByCategory: { food: 300 },
        expenseByProject: { tokyo: 300 },
      }),
    );
  });

  it("leaves the Project maps empty for everyday spending — no sentinel key", () => {
    expect(monthContribution(p("expense", 300, "food", null), 1)).toEqual(
      contribution({ expense: 300, expenseByCategory: { food: 300 } }),
    );
  });

  it("excludes transfers from the Project maps too", () => {
    expect(monthContribution(p("transfer", 20000, null, "tokyo"), 1)).toBeNull();
  });

  it("rebuilding from events reproduces the same per-Project totals", () => {
    const rollups = rollupsFrom([
      { ...p("expense", 300, "food", "tokyo"), yearMonth: "2026-07" },
      { ...p("expense", 120, "fun", "tokyo"), yearMonth: "2026-07" },
      { ...p("expense", 500, "food", null), yearMonth: "2026-07" },
      { ...p("income", 800, "refund", "tokyo"), yearMonth: "2026-07" },
      { ...p("transfer", 20000, null, "tokyo"), yearMonth: "2026-07" },
    ]);
    const jul = rollups.get("2026-07")!;
    expect(jul.expenseByProject).toEqual({ tokyo: 420 });
    expect(jul.incomeByProject).toEqual({ tokyo: 800 });
    expect(jul.expense).toBe(920);
  });

  it("derives everyday spending by subtraction, so it cannot disagree with the total", () => {
    const jul = rollupsFrom([
      { ...p("expense", 300, "food", "tokyo"), yearMonth: "2026-07" },
      { ...p("expense", 120, "fun", "reno"), yearMonth: "2026-07" },
      { ...p("expense", 500, "food", null), yearMonth: "2026-07" },
      { ...p("income", 800, "refund", "tokyo"), yearMonth: "2026-07" },
      { ...p("income", 5000, "salary", null), yearMonth: "2026-07" },
    ]).get("2026-07")!;
    expect(everydayExpense(jul)).toBe(500);
    expect(everydayIncome(jul)).toBe(5000);
    // The parts always add back up to the headline figure.
    expect(everydayExpense(jul) + 300 + 120).toBe(jul.expense);
  });
});

describe("projectTotals", () => {
  const agg = (over: Partial<RollupContribution>) => contribution(over);

  it("reports each Project's cost net of the income it brought back", () => {
    // A wedding that took 200,000 in gifts and spent 350,000 cost 150,000.
    expect(
      projectTotals(
        agg({
          expenseByProject: { wedding: 350000, tokyo: 68432 },
          incomeByProject: { wedding: 200000 },
        }),
      ),
    ).toEqual([
      { projectId: "wedding", expense: 350000, income: 200000, net: 150000 },
      { projectId: "tokyo", expense: 68432, income: 0, net: 68432 },
    ]);
  });

  it("sorts by net cost, so the expensive episode is not buried", () => {
    const rows = projectTotals(
      agg({ expenseByProject: { a: 100, b: 900, c: 500 } }),
    );
    expect(rows.map((r) => r.projectId)).toEqual(["b", "c", "a"]);
  });

  it("includes a Project that only brought income in, as a negative net", () => {
    expect(projectTotals(agg({ incomeByProject: { refunded: 800 } }))).toEqual([
      { projectId: "refunded", expense: 0, income: 800, net: -800 },
    ]);
  });

  it("is empty when nothing was attributed to a Project", () => {
    expect(projectTotals(agg({ expense: 5000, expenseByCategory: { food: 5000 } }))).toEqual([]);
  });

  it("drops a Project whose figures cancelled out to nothing", () => {
    // A reversed edit can leave a zero key behind; it is not a real episode.
    expect(projectTotals(agg({ expenseByProject: { gone: 0 } }))).toEqual([]);
  });
});
