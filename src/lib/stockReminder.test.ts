import { describe, it, expect } from "vitest";
import { isStockReminderDue } from "./stockReminder";

// The quarterly anchors are Mar/Jun/Sep/Dec 15 (local). "Now" is mid-August
// 2026, so the most recent anchor is 2026-06-15.
const NOW = new Date(2026, 7, 20).getTime();
const BEFORE_ANCHOR = new Date(2026, 5, 1);
const AFTER_ANCHOR = new Date(2026, 6, 1);

const holding = (pricedAt: Date | null, archived = false) => ({ pricedAt, archived });

describe("isStockReminderDue", () => {
  it("is due when nothing has been priced since the last quarterly anchor", () => {
    expect(isStockReminderDue([holding(BEFORE_ANCHOR)], NOW)).toBe(true);
  });

  it("is not due once any holding has been re-priced since the anchor", () => {
    expect(isStockReminderDue([holding(BEFORE_ANCHOR), holding(AFTER_ANCHOR)], NOW)).toBe(false);
  });

  it("is not due with no holdings at all", () => {
    expect(isStockReminderDue([], NOW)).toBe(false);
  });

  it("ignores archived holdings — an archived position needs no price", () => {
    expect(isStockReminderDue([holding(BEFORE_ANCHOR, true)], NOW)).toBe(false);
    expect(isStockReminderDue([holding(BEFORE_ANCHOR, true), holding(AFTER_ANCHOR)], NOW)).toBe(
      false,
    );
  });

  it("treats a never-priced holding as overdue", () => {
    expect(isStockReminderDue([holding(null)], NOW)).toBe(true);
  });
});
