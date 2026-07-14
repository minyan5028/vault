/**
 * Money helpers — the one place that knows the ×100 scaling rule.
 *
 * See docs/ADR/0001-money-fixed-point-integer.md and docs/DATA_MODEL.md.
 * Every stored amount is an integer scaled by 100 ("minor units"). We never do
 * arithmetic on the decimal (major) form — only integers add/subtract exactly.
 */

/** Fixed scale for every currency: stored = displayed × 100. */
export const MINOR_SCALE = 100;

/** Currency codes offered in pickers (accounts, holdings) — a dropdown so only
 *  valid ISO 4217 codes are stored. Base currency (TWD) first. */
export const CURRENCIES = ["TWD", "USD", "JPY", "HKD", "EUR", "GBP", "CNY"];

/**
 * Presentation-only privacy toggle. When on, formatMoney / shortMoney mask the
 * digits (keeping the currency symbol) so amounts can be hidden for demos /
 * screen-sharing. A module flag read at format time; a context toggle flips it
 * and forces a re-render (see AmountVisibility). Never affects stored data.
 */
let amountsHidden = false;
export const setAmountsHidden = (hidden: boolean) => {
  amountsHidden = hidden;
};
export const areAmountsHidden = () => amountsHidden;
const MASK = "••••";
const maskDigits = (s: string) => s.replace(/[\d.,]+/, MASK);

/**
 * Convert a user-entered major value (e.g. 149.9 or "149.90") into stored
 * minor units (14990). Rounds to the nearest minor unit; rejects non-finite
 * or unparseable input.
 */
export function toMinor(major: number | string): number {
  const value = typeof major === "string" ? Number(major.trim()) : major;
  if (!Number.isFinite(value)) {
    throw new Error(`toMinor: not a finite number: ${JSON.stringify(major)}`);
  }
  // Round in a way that is stable for .5 cases and avoids float drift like
  // 1.005 * 100 = 100.49999999999999.
  return Math.round((value + Number.EPSILON * Math.sign(value)) * MINOR_SCALE);
}

/** Convert stored minor units (14990) back to a major number (149.9) for display. */
export function toMajor(minor: number): number {
  assertMinor(minor);
  return minor / MINOR_SCALE;
}

/** Sum stored minor amounts exactly (integer addition). */
export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, a) => {
    assertMinor(a);
    return total + a;
  }, 0);
}

/**
 * Format a stored minor amount for display in its currency.
 * Intl applies each currency's own decimal rule (TWD/USD → 2 places, JPY → 0),
 * so ¥ shows no decimals even though it is stored ×100.
 *
 * An invalid/unknown currency code (e.g. a typo like "TW" instead of "TWD")
 * makes Intl throw a RangeError. We must never let that crash a render, so we
 * fall back to a plain number with the raw code appended.
 */
export function formatMoney(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const major = toMajor(minor);
  let full: string;
  try {
    full = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(major);
  } catch {
    const amount = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
    full = `${amount} ${currency}`;
  }
  return amountsHidden ? maskDigits(full) : full;
}

/**
 * Compact money for tight spots (chart axes, tooltips): `67.0萬` / `$670K`.
 * Chinese groups by 萬/億 (10^4/10^8); other locales by K/M. Not for precise
 * figures — it rounds.
 */
export function shortMoney(minor: number, locale?: string): string {
  if (amountsHidden) return MASK;
  const major = minor / MINOR_SCALE;
  const abs = Math.abs(major);
  const sign = major < 0 ? "−" : "";
  if ((locale ?? "").startsWith("zh")) {
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}億`;
    if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}萬`;
    return `${sign}${Math.round(abs)}`;
  }
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function assertMinor(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new Error(`money: minor amount must be an integer, got ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`money: minor amount exceeds safe integer range: ${minor}`);
  }
}
