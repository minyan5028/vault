import { describe, it, expect } from "vitest";
import { toMinor, toMajor, sumMinor, formatMoney, shortMoney, MINOR_SCALE } from "./money";

describe("toMinor", () => {
  it("scales major values by 100", () => {
    expect(toMinor(149.9)).toBe(14990);
    expect(toMinor("149.90")).toBe(14990);
    expect(toMinor(10.25)).toBe(1025);
    expect(toMinor(0)).toBe(0);
  });

  it("treats whole numbers uniformly (JPY has no fractional use)", () => {
    // ¥16,000 stored ×100, formatted with 0 decimals elsewhere.
    expect(toMinor(16000)).toBe(1600000);
  });

  it("rounds half-cent inputs instead of drifting", () => {
    expect(toMinor(1.005)).toBe(101); // classic float trap: 1.005*100 = 100.4999…
    expect(toMinor(2.675)).toBe(268);
  });

  it("rejects non-finite / unparseable input", () => {
    expect(() => toMinor("abc")).toThrow();
    expect(() => toMinor(Infinity)).toThrow();
    expect(() => toMinor(NaN)).toThrow();
  });
});

describe("toMajor", () => {
  it("is the inverse of toMinor for display", () => {
    expect(toMajor(14990)).toBe(149.9);
    expect(toMajor(1025)).toBe(10.25);
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => toMajor(149.9)).toThrow();
  });
});

describe("sumMinor", () => {
  it("adds exactly where floats would drift", () => {
    // 0.01 × 10000 = 100.00 exactly with integers; floats give 100.00000000001425
    const cents = Array.from({ length: 10000 }, () => 1);
    expect(sumMinor(cents)).toBe(10000);
    expect(toMajor(sumMinor(cents))).toBe(100);
  });

  it("handles the 0.1 + 0.2 trap", () => {
    expect(sumMinor([toMinor(0.1), toMinor(0.2)])).toBe(toMinor(0.3));
  });

  it("rejects a non-integer amount in the list", () => {
    expect(() => sumMinor([100, 1.5])).toThrow();
  });
});

describe("formatMoney", () => {
  it("applies each currency's own decimal rule", () => {
    expect(formatMoney(14990, "TWD", "en-US")).toContain("149.90");
    expect(formatMoney(1025, "USD", "en-US")).toBe("$10.25");
    // JPY: stored 1,600,000 → ¥16,000 with no decimals
    expect(formatMoney(1600000, "JPY", "en-US")).toBe("¥16,000");
  });
  it("falls back to a plain number + code for an invalid currency (never throws)", () => {
    // "TW" is not a valid ISO 4217 code (should be "TWD") — Intl would throw.
    expect(formatMoney(80000, "TW", "en-US")).toBe("800.00 TW");
  });
});

describe("shortMoney", () => {
  it("groups by 萬/億 in Chinese", () => {
    expect(shortMoney(67017600, "zh-TW")).toBe("67.0萬"); // 670,176
    expect(shortMoney(16762300, "zh-TW")).toBe("16.8萬"); // 167,623
    expect(shortMoney(25000000000, "zh-TW")).toBe("2.5億"); // 250,000,000
    expect(shortMoney(-500000, "zh-TW")).toBe("−5000");
  });
  it("groups by K/M elsewhere", () => {
    expect(shortMoney(67017600, "en")).toBe("$670K");
    expect(shortMoney(25000000000, "en")).toBe("$250.0M");
  });
});

describe("MINOR_SCALE", () => {
  it("is the single fixed factor", () => {
    expect(MINOR_SCALE).toBe(100);
  });
});
