/** `yearMonth` denormalization key (see docs/DATA_MODEL.md), e.g. "2026-07". */
export function yearMonthOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Format a Date as a local `yyyy-mm-dd` for <input type="date"> (no UTC shift). */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a `yyyy-mm-dd` input value into a local Date at midnight. */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Add whole days to a date (returns a new Date). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Local-time midnight of the most recent Monday (start of the current week).
 *  Anchors the weekly FX auto-refresh so it doesn't drift week over week. */
export function thisMondayMidnight(now: number): number {
  const d = new Date(now);
  const daysSinceMonday = (d.getDay() + 6) % 7; // Mon→0, Tue→1, … Sun→6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/** Add whole months, clamping the day to the target month's length (Jan 31 + 1m → Feb 28/29). */
export function addMonthsClamped(date: Date, n: number): Date {
  const day = date.getDate();
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInMonth));
  d.setHours(date.getHours(), date.getMinutes(), 0, 0);
  return d;
}

/** Shift a `yyyy-mm` key by whole months. */
export function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return yearMonthOf(new Date(y, m - 1 + delta, 1));
}

/** Locale month heading for a `yyyy-mm` key (e.g. "2026年7月" / "July 2026"). */
export function monthLabel(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(y, m - 1, 1),
  );
}
