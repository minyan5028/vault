import { toDateInputValue, fromDateInputValue } from "./date";
import type { Transaction } from "../domain/types";

/** Group transactions by local day, preserving the input order within each day. */
export function groupByDay(txns: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const e of txns) {
    const key = toDateInputValue(e.date);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()];
}

/** Friendly day heading: Today / Yesterday / weekday-month-day. */
export function dayLabel(
  key: string,
  locale: string,
  t: (k: "today" | "yesterday") => string,
): string {
  const today = toDateInputValue(new Date());
  const yesterday = toDateInputValue(new Date(Date.now() - 86_400_000));
  if (key === today) return t("today");
  if (key === yesterday) return t("yesterday");
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(fromDateInputValue(key));
}
