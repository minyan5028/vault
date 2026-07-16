import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonthsClamped,
  thisMondayMidnight,
  lastQuarterlyAnchor,
  shiftMonth,
  yearMonthOf,
  toDateInputValue,
  fromDateInputValue,
} from "./date";

describe("addDays", () => {
  it("adds days across a month boundary", () => {
    expect(toDateInputValue(addDays(new Date(2026, 0, 30), 5))).toBe("2026-02-04");
  });
});

describe("addMonthsClamped", () => {
  it("clamps the day to a shorter target month", () => {
    // 2026 is not a leap year → Feb has 28 days
    expect(toDateInputValue(addMonthsClamped(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    // 2024 is a leap year → Feb has 29 days
    expect(toDateInputValue(addMonthsClamped(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
  });
  it("keeps the day when it fits", () => {
    expect(toDateInputValue(addMonthsClamped(new Date(2026, 0, 15), 2))).toBe("2026-03-15");
  });
  it("crosses year boundaries", () => {
    expect(toDateInputValue(addMonthsClamped(new Date(2026, 11, 10), 1))).toBe("2027-01-10");
  });
});

describe("shiftMonth", () => {
  it("shifts a yyyy-mm key across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("date input round-trip", () => {
  it("round-trips local dates without a UTC shift", () => {
    expect(toDateInputValue(fromDateInputValue("2026-07-05"))).toBe("2026-07-05");
    expect(yearMonthOf(new Date(2026, 6, 5))).toBe("2026-07");
  });
});

describe("lastQuarterlyAnchor", () => {
  const t = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  it("returns the most recent Mar/Jun/Sep/Dec 15 at or before now", () => {
    expect(lastQuarterlyAnchor(t(2026, 6, 16))).toBe(t(2026, 5, 15)); // Jul 16 → Jun 15
    expect(lastQuarterlyAnchor(t(2026, 2, 15))).toBe(t(2026, 2, 15)); // Mar 15 → same day
    expect(lastQuarterlyAnchor(t(2026, 11, 20))).toBe(t(2026, 11, 15)); // Dec 20 → Dec 15
  });
  it("rolls back to the previous December before mid-March", () => {
    expect(lastQuarterlyAnchor(t(2026, 2, 14))).toBe(t(2025, 11, 15)); // Mar 14 → prev Dec 15
    expect(lastQuarterlyAnchor(t(2026, 0, 5))).toBe(t(2025, 11, 15)); // Jan 5 → prev Dec 15
  });
});

describe("thisMondayMidnight", () => {
  const monday = new Date(2026, 6, 6, 0, 0, 0).getTime(); // Mon 2026-07-06 00:00 local
  it("maps any day of the week back to that week's Monday midnight", () => {
    expect(thisMondayMidnight(new Date(2026, 6, 6, 9, 0).getTime())).toBe(monday); // Mon
    expect(thisMondayMidnight(new Date(2026, 6, 8, 14, 30).getTime())).toBe(monday); // Wed
    expect(thisMondayMidnight(new Date(2026, 6, 12, 23, 0).getTime())).toBe(monday); // Sun
  });
  it("rolls to the next Monday once a new week starts", () => {
    const nextMon = new Date(2026, 6, 13, 0, 0).getTime();
    expect(thisMondayMidnight(new Date(2026, 6, 13, 0, 30).getTime())).toBe(nextMon);
  });
});
