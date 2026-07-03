/**
 * Numpad amount entry. The keypad builds the stored minor-unit integer directly
 * (calculator style): typing 1·4·9·9·0 yields 14990 = NT$149.90. No decimal
 * parsing, so it stays exact and matches the ×100 rule (see lib/money.ts).
 */

/** Cap to keep amounts within safe-integer range with headroom. */
const MAX_MINOR = 1_000_000_000_00; // 1e11 minor units

/** Append one typed digit (0–9) to the current minor amount. */
export function appendDigit(minor: number, digit: number): number {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
    throw new Error(`appendDigit: expected a digit 0-9, got ${digit}`);
  }
  const next = minor * 10 + digit;
  return next > MAX_MINOR ? minor : next;
}

/** Remove the last typed digit. */
export function backspace(minor: number): number {
  return Math.trunc(minor / 10);
}
