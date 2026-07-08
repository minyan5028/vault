import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { useRollups } from "../../data/useRollups";
import { sumRollups } from "../../lib/rollup";
import { UNCATEGORIZED, type Category } from "../../domain/types";
import { TrendChart, type TrendPoint } from "./TrendChart";

const BASE_CURRENCY = "TWD";

type Period = "month" | "year";
type View = "category" | "trend";

/**
 * Spending analytics, read from the per-month rollups (a handful of small docs,
 * not every transaction — see MonthlyRollup). A 12-month window feeds both the
 * category breakdown for the selected period (a month, or a whole year) and the
 * trend chart.
 */
export function Stats({ ledgerId, categories }: { ledgerId: string; categories: Category[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<View>("category");
  const [anchor, setAnchor] = useState<string>(() => yearMonthOf(new Date()));

  // The visible 12-month window, and which of its months make up the selected
  // period (just the anchor month, or all twelve of the anchor's year).
  const { windowStart, windowEnd, months, inPeriod } = useMemo(() => {
    const year = anchor.slice(0, 4);
    if (period === "year") {
      const ms = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      return {
        windowStart: ms[0],
        windowEnd: ms[11],
        months: ms,
        inPeriod: (ym: string) => ym.slice(0, 4) === year,
      };
    }
    const start = shiftMonth(anchor, -11);
    const ms = Array.from({ length: 12 }, (_, i) => shiftMonth(start, i));
    return {
      windowStart: start,
      windowEnd: anchor,
      months: ms,
      inPeriod: (ym: string) => ym === anchor,
    };
  }, [anchor, period]);

  const rollups = useRollups(ledgerId, windowStart, windowEnd);
  const byMonth = useMemo(() => new Map(rollups.map((r) => [r.yearMonth, r])), [rollups]);
  const agg = useMemo(
    () => sumRollups(rollups.filter((r) => inPeriod(r.yearMonth))),
    [rollups, inPeriod],
  );

  const rows = useMemo(
    () =>
      Object.entries(agg.expenseByCategory)
        .filter(([, v]) => v > 0)
        .map(([id, amount]) => ({ id, amount }))
        .sort((a, b) => b.amount - a.amount),
    [agg],
  );

  const trend: TrendPoint[] = useMemo(
    () =>
      months.map((ym) => ({
        ym,
        expense: byMonth.get(ym)?.expense ?? 0,
        income: byMonth.get(ym)?.income ?? 0,
      })),
    [months, byMonth],
  );

  const shift = (d: number) => setAnchor((a) => shiftMonth(a, period === "year" ? d * 12 : d));
  const heading = period === "year" ? anchor.slice(0, 4) : monthLabel(anchor, locale);
  const selectTrendMonth = (ym: string) => {
    if (period === "year") setPeriod("month");
    setAnchor(ym);
  };

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <header className="flex items-center justify-between py-1">
          <span className="text-lg font-semibold tracking-tight">{t("stats")}</span>
          <div className="flex gap-1 text-xs">
            {(["month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={
                  "rounded-full px-3 py-1 " +
                  (period === p ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400")
                }
              >
                {t(p === "month" ? "periodMonth" : "periodYear")}
              </button>
            ))}
          </div>
        </header>

        {/* period navigator */}
        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} className="px-3 py-2 text-slate-400">
            ‹
          </button>
          <span className="text-sm font-medium tabular-nums">{heading}</span>
          <button type="button" onClick={() => shift(1)} className="px-3 py-2 text-slate-400">
            ›
          </button>
        </div>

        {/* income / expense / net for the selected period */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <Stat label={t("income")} minor={agg.income} locale={locale} className="text-sky-400" />
          <Stat label={t("expense")} minor={agg.expense} locale={locale} className="text-rose-400" />
          <Stat label={t("net")} minor={agg.income - agg.expense} locale={locale} />
        </div>

        {/* view sub-tabs: category / trend */}
        <div className="mt-3 flex gap-2 text-xs">
          {(["category", "trend"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                "rounded-full px-3 py-1 " +
                (view === v ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400")
              }
            >
              {t(v === "category" ? "byCategory" : "trend")}
            </button>
          ))}
        </div>

        {view === "trend" ? (
          <TrendChart points={trend} selected={anchor} locale={locale} onSelect={selectTrendMonth} />
        ) : agg.expense === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => {
              const cat = r.id === UNCATEGORIZED ? undefined : categories.find((c) => c.id === r.id);
              const pct = Math.round((r.amount / agg.expense) * 100);
              return (
                <li key={r.id}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="text-base">{cat?.icon ?? "•"}</span>
                    <span className="flex-1 truncate text-slate-200">
                      {cat?.name ?? t("uncategorized")}
                    </span>
                    <span className="tabular-nums text-slate-400">{pct}%</span>
                    <span className="w-24 text-right tabular-nums text-slate-200">
                      {formatMoney(r.amount, BASE_CURRENCY, locale)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-rose-500/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  minor,
  locale,
  className = "",
}: {
  label: string;
  minor: number;
  locale: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={"mt-0.5 text-base font-semibold tabular-nums " + className}>
        {formatMoney(minor, BASE_CURRENCY, locale)}
      </p>
    </div>
  );
}
