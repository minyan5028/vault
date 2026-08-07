import { describe, it, expect } from "vitest";
import {
  ledgerEffect,
  combineEffects,
  mergedEvent,
  storedEvent,
  isEmptyEffect,
  type EventProjectionFields,
  type StoredEventFields,
} from "./ledgerEffect";

const expense = (over: Partial<EventProjectionFields> = {}): EventProjectionFields => ({
  type: "expense",
  accountId: "cash",
  toAccountId: null,
  amount: 300,
  baseAmount: 300,
  categoryId: "food",
  yearMonth: "2026-07",
  ...over,
});

const transfer = (over: Partial<EventProjectionFields> = {}): EventProjectionFields => ({
  type: "transfer",
  accountId: "cash",
  toAccountId: "bank",
  amount: 1000,
  toAmount: 1000,
  baseAmount: 1000,
  categoryId: null,
  yearMonth: "2026-07",
  ...over,
});

const months = (e: ReturnType<typeof ledgerEffect>) => Object.fromEntries(e.monthContributions);

describe("ledgerEffect — recording an event", () => {
  it("debits the account and adds to the month's expense", () => {
    const e = ledgerEffect(null, expense());
    expect(e.balanceDeltas).toEqual({ cash: -300 });
    expect(months(e)).toEqual({
      "2026-07": { income: 0, expense: 300, expenseByCategory: { food: 300 }, incomeByCategory: {} },
    });
  });

  it("credits the account and adds to the month's income", () => {
    const e = ledgerEffect(null, expense({ type: "income", categoryId: "salary" }));
    expect(e.balanceDeltas).toEqual({ cash: 300 });
    expect(months(e)["2026-07"].income).toBe(300);
  });

  it("moves both legs of a transfer and touches no month rollup", () => {
    const e = ledgerEffect(null, transfer());
    expect(e.balanceDeltas).toEqual({ cash: -1000, bank: 1000 });
    expect(e.monthContributions.size).toBe(0);
  });

  it("credits a cross-currency transfer's destination its own toAmount", () => {
    const e = ledgerEffect(null, transfer({ amount: 1000, toAmount: 32 }));
    expect(e.balanceDeltas).toEqual({ cash: -1000, bank: 32 });
  });
});

describe("ledgerEffect — deleting and restoring", () => {
  it("reverses everything on delete", () => {
    const e = ledgerEffect(expense(), null);
    expect(e.balanceDeltas).toEqual({ cash: 300 });
    expect(months(e)["2026-07"].expense).toBe(-300);
  });

  it("re-applies everything on restore, exactly undoing the delete", () => {
    const del = ledgerEffect(expense(), null);
    const res = ledgerEffect(null, expense());
    expect(combineEffects([del, res])).toEqual({
      balanceDeltas: {},
      monthContributions: new Map(),
    });
  });
});

describe("ledgerEffect — editing", () => {
  it("nets the balance and month change within one month", () => {
    const e = ledgerEffect(expense(), expense({ amount: 500, baseAmount: 500 }));
    expect(e.balanceDeltas).toEqual({ cash: -200 });
    expect(months(e)["2026-07"].expense).toBe(200);
  });

  it("splits into two months when the date crosses a boundary", () => {
    const e = ledgerEffect(expense(), expense({ yearMonth: "2026-08" }));
    // The balance is date-independent, so moving the date alone moves no money.
    expect(e.balanceDeltas).toEqual({});
    expect(months(e)).toEqual({
      "2026-07": {
        income: 0,
        expense: -300,
        expenseByCategory: { food: -300 },
        incomeByCategory: {},
      },
      "2026-08": {
        income: 0,
        expense: 300,
        expenseByCategory: { food: 300 },
        incomeByCategory: {},
      },
    });
  });

  it("moves the money between accounts when the account changes", () => {
    const e = ledgerEffect(expense(), expense({ accountId: "bank" }));
    expect(e.balanceDeltas).toEqual({ cash: 300, bank: -300 });
    expect(e.monthContributions.size).toBe(0);
  });

  it("moves the month total between categories when the category changes", () => {
    const e = ledgerEffect(expense(), expense({ categoryId: "transport" }));
    expect(e.balanceDeltas).toEqual({});
    expect(months(e)["2026-07"].expenseByCategory).toEqual({ food: -300, transport: 300 });
  });
});

/**
 * The rollup was wiped on 2026-08-01 because a cancelled-out delta was written
 * as an empty `netFlow` map. Every route to a no-op effect is covered here, so
 * the repo can keep trusting "empty means write nothing".
 */
describe("ledgerEffect — no-op writes (the 2026-08-01 rollup wipe)", () => {
  it("reports a same-account transfer as nothing to write", () => {
    const e = ledgerEffect(null, transfer({ toAccountId: "cash" }));
    expect(e.balanceDeltas).toEqual({});
    expect(isEmptyEffect(e)).toBe(true);
  });

  it("reports a zero amount as nothing to write", () => {
    const e = ledgerEffect(null, expense({ amount: 0, baseAmount: 0 }));
    expect(isEmptyEffect(e)).toBe(true);
  });

  it("reports an edit that changes neither amount, account, category nor month as nothing to write", () => {
    const e = ledgerEffect(expense(), expense());
    expect(isEmptyEffect(e)).toBe(true);
  });

  it("reports both sides absent as nothing to write — editing a soft-deleted event", () => {
    expect(isEmptyEffect(ledgerEffect(null, null))).toBe(true);
  });

  it("reports a holding teardown whose legs net out as nothing to write", () => {
    const buy = ledgerEffect(transfer({ toAccountId: "holding-1" }), null);
    const sell = ledgerEffect(transfer({ accountId: "holding-1", toAccountId: "cash" }), null);
    expect(isEmptyEffect(combineEffects([buy, sell]))).toBe(true);
  });

  it("still reports movement when an edit does change the amount", () => {
    expect(isEmptyEffect(ledgerEffect(expense(), expense({ amount: 301 })))).toBe(false);
  });
});

describe("combineEffects", () => {
  it("sums balance deltas across events into one write", () => {
    const e = combineEffects([
      ledgerEffect(null, expense({ amount: 100, baseAmount: 100 })),
      ledgerEffect(null, expense({ amount: 250, baseAmount: 250 })),
    ]);
    expect(e.balanceDeltas).toEqual({ cash: -350 });
    expect(months(e)["2026-07"].expense).toBe(350);
  });

  it("keeps different months apart", () => {
    const e = combineEffects([
      ledgerEffect(null, expense()),
      ledgerEffect(null, expense({ yearMonth: "2026-08" })),
    ]);
    expect([...e.monthContributions.keys()]).toEqual(["2026-07", "2026-08"]);
  });

  it("is empty for no effects at all", () => {
    expect(isEmptyEffect(combineEffects([]))).toBe(true);
  });
});

/**
 * Editing an amount without also passing a baseAmount used to leave the month
 * rollups showing the old figure, because the merge trusted the stored
 * baseAmount (fixed in fda8098).
 */
describe("mergedEvent", () => {
  const stored: StoredEventFields = {
    type: "expense",
    accountId: "cash",
    toAccountId: null,
    amount: 300,
    baseAmount: 900,
    fxRate: 3,
    categoryId: "food",
    yearMonth: "2026-07",
  };

  it("re-derives baseAmount from amount × fxRate rather than the stored value", () => {
    expect(mergedEvent(stored, { amount: 500 }).baseAmount).toBe(1500);
  });

  it("takes an explicit baseAmount when the patch carries one", () => {
    expect(mergedEvent(stored, { amount: 500, baseAmount: 1234 }).baseAmount).toBe(1234);
  });

  it("re-derives baseAmount from a new fxRate", () => {
    expect(mergedEvent(stored, { fxRate: 4 }).baseAmount).toBe(1200);
  });

  it("keeps the stored category when the patch omits it", () => {
    expect(mergedEvent(stored, { amount: 1 }).categoryId).toBe("food");
  });

  it("clears the category when the patch sets it to null explicitly", () => {
    expect(mergedEvent(stored, { categoryId: null }).categoryId).toBeNull();
  });

  it("keeps the stored month when the patch has no new date", () => {
    expect(mergedEvent(stored, { amount: 1 }).yearMonth).toBe("2026-07");
  });

  it("leaves an untouched event's projection unchanged", () => {
    const consistent = { ...stored, baseAmount: 900, amount: 300, fxRate: 3 };
    expect(isEmptyEffect(ledgerEffect(storedEvent(consistent), mergedEvent(consistent)))).toBe(true);
  });
});

describe("storedEvent", () => {
  it("defaults toAmount to amount for a same-currency transfer", () => {
    expect(storedEvent({ ...transfer(), toAmount: undefined }).toAmount).toBe(1000);
  });

  it("reads a document that predates the denormalized fields", () => {
    const e = storedEvent({
      type: "expense",
      accountId: "cash",
      amount: 300,
      yearMonth: "2026-07",
    });
    expect(e.toAccountId).toBeNull();
    expect(e.categoryId).toBeNull();
    expect(e.baseAmount).toBe(0);
  });
});
