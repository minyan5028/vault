import { describe, it, expect } from "vitest";
import { appendDigit, backspace } from "./amountInput";
import { formatMoney } from "../../lib/money";

describe("appendDigit", () => {
  it("builds minor units by typing digits left to right", () => {
    let m = 0;
    for (const d of [1, 4, 9, 9, 0]) m = appendDigit(m, d);
    expect(m).toBe(14990);
    expect(formatMoney(m, "TWD", "en-US")).toContain("149.90");
  });

  it("stays at zero until a nonzero digit is typed", () => {
    expect(appendDigit(0, 0)).toBe(0);
    expect(appendDigit(0, 5)).toBe(5);
  });

  it("caps instead of overflowing past the safe range", () => {
    let m = 0;
    for (let i = 0; i < 40; i++) m = appendDigit(m, 9);
    expect(Number.isSafeInteger(m)).toBe(true);
  });

  it("rejects non-digits", () => {
    expect(() => appendDigit(0, 10)).toThrow();
    expect(() => appendDigit(0, -1)).toThrow();
  });
});

describe("backspace", () => {
  it("drops the last digit", () => {
    expect(backspace(14990)).toBe(1499);
    expect(backspace(5)).toBe(0);
    expect(backspace(0)).toBe(0);
  });
});
