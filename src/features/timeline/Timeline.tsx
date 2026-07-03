import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { toDateInputValue, fromDateInputValue, yearMonthOf } from "../../lib/date";
import { SEED_ACCOUNTS, SEED_CATEGORIES } from "../../data/fixtures";
import type { SessionEntry } from "../entries";
import { LanguageToggle } from "../../components/LanguageToggle";

const BASE_CURRENCY = "TWD";

/**
 * The home screen: a month of Financial Events grouped by day, with a monthly
 * income/expense/total summary and per-day subtotals (see docs/UX.md).
 */
export function Timeline({ entries }: { entries: SessionEntry[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));

  const monthEntries = useMemo(
    () => entries.filter((e) => yearMonthOf(e.date) === month),
    [entries, month],
  );
  const summary = useMemo(() => totals(monthEntries), [monthEntries]);
  const groups = useMemo(() => groupByDay(monthEntries), [monthEntries]);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28">
        {/* Header */}
        <header className="flex items-center justify-between py-3">
          <span className="text-lg font-semibold tracking-tight">{t("appName")}</span>
          <LanguageToggle />
        </header>

        {/* Month selector */}
        <div className="flex items-center justify-between py-1 text-slate-300">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="previous month"
            className="px-3 py-1 text-xl text-slate-400"
          >
            ‹
          </button>
          <span className="text-base font-medium">{monthLabel(month, locale)}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="next month"
            className="px-3 py-1 text-xl text-slate-400"
          >
            ›
          </button>
        </div>

        {/* Income / Expense / Total summary */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <SummaryCell label={t("income")} minor={summary.income} tone="income" locale={locale} />
          <SummaryCell label={t("expense")} minor={summary.expense} tone="expense" locale={locale} />
          <SummaryCell label={t("total")} minor={summary.net} tone="total" locale={locale} />
        </div>

        {/* Day-grouped list */}
        {monthEntries.length === 0 ? (
          <div className="mt-20 text-center text-slate-600">
            <div className="text-4xl">💰</div>
            <p className="mt-3 text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => {
              const net = totals(items).net;
              return (
                <section key={day}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <h2 className="uppercase tracking-wide text-slate-400">
                      {dayLabel(day, locale, t)}
                    </h2>
                    <span className="tabular-nums text-slate-500">
                      {formatMoney(net, BASE_CURRENCY, locale)}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-800">
                    {items.map((e) => (
                      <EntryRow key={e.id} entry={e} locale={locale} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCell({
  label,
  minor,
  tone,
  locale,
}: {
  label: string;
  minor: number;
  tone: "income" | "expense" | "total";
  locale: string;
}) {
  const color =
    tone === "income"
      ? "text-sky-400"
      : tone === "expense"
        ? "text-rose-400"
        : "text-slate-100";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold tabular-nums " + color}>
        {formatMoney(minor, BASE_CURRENCY, locale)}
      </p>
    </div>
  );
}

function EntryRow({ entry, locale }: { entry: SessionEntry; locale: string }) {
  const category = SEED_CATEGORIES.find((c) => c.id === entry.categoryId);
  const account = SEED_ACCOUNTS.find((a) => a.id === entry.accountId);
  const toAccount = SEED_ACCOUNTS.find((a) => a.id === entry.toAccountId);
  const label =
    entry.title ||
    (entry.type === "transfer"
      ? `${account?.name} → ${toAccount?.name}`
      : category?.name) ||
    "";
  const sign = entry.type === "income" ? "+" : entry.type === "expense" ? "−" : "";
  const amountColor =
    entry.type === "income"
      ? "text-sky-400"
      : entry.type === "expense"
        ? "text-rose-300"
        : "text-slate-400";

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="text-xl">{entry.type === "transfer" ? "↔️" : category?.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200">{label}</p>
        <p className="text-xs text-slate-500">{account?.name}</p>
      </div>
      <span className={"text-sm tabular-nums " + amountColor}>
        {sign}
        {formatMoney(entry.amount, entry.currency, locale)}
      </span>
    </li>
  );
}

/** Income/expense/net totals in minor units (transfers excluded from spend). */
function totals(items: SessionEntry[]): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const e of items) {
    if (e.type === "income") income += e.amount;
    else if (e.type === "expense") expense += e.amount;
  }
  return { income, expense, net: income - expense };
}

/** Group entries by local day, preserving newest-first order. */
function groupByDay(entries: SessionEntry[]): [string, SessionEntry[]][] {
  const map = new Map<string, SessionEntry[]>();
  for (const e of entries) {
    const key = toDateInputValue(e.date);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()];
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return yearMonthOf(new Date(y, m - 1 + delta, 1));
}

function monthLabel(ym: string, locale: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(y, m - 1, 1),
  );
}

function dayLabel(key: string, locale: string, t: (k: "today" | "yesterday") => string): string {
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
