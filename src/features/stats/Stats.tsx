import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { useRollups } from "../../data/useRollups";
import { useTransactionsForMonths } from "../../data/useTransactionsForMonths";
import { sumRollups } from "../../lib/rollup";
import { UNCATEGORIZED, type Category } from "../../domain/types";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { CategoryDonut, SLICE_COLORS, OTHER_COLOR, type Slice } from "./CategoryDonut";

const BASE_CURRENCY = "TWD";

type Period = "month" | "year";
type View = "category" | "trend" | "content";
type Mode = "expense" | "income";

/**
 * Spending analytics, read from the per-month rollups (a handful of small docs,
 * not every transaction — see MonthlyRollup). A 12-month window feeds the
 * category breakdown and the trend chart for the selected period (a month, or a
 * whole year). The by-title view fetches that period's raw transactions
 * on-demand, since titles aren't in the rollups.
 */
export function Stats({ ledgerId, categories }: { ledgerId: string; categories: Category[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<View>("category");
  // Income vs expense drives the category donut and the by-title list (each is
  // one total broken apart); the trend chart always shows both.
  const [mode, setMode] = useState<Mode>("expense");
  const [anchor, setAnchor] = useState<string>(() => yearMonthOf(new Date()));

  // The visible 12-month window, the months that make up the selected period
  // (just the anchor month, or all twelve of the anchor's year), and a period
  // membership test.
  const { windowStart, windowEnd, months, periodMonths, inPeriod } = useMemo(() => {
    const year = anchor.slice(0, 4);
    if (period === "year") {
      const ms = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      return {
        windowStart: ms[0],
        windowEnd: ms[11],
        months: ms,
        periodMonths: ms,
        inPeriod: (ym: string) => ym.slice(0, 4) === year,
      };
    }
    const start = shiftMonth(anchor, -11);
    const ms = Array.from({ length: 12 }, (_, i) => shiftMonth(start, i));
    return {
      windowStart: start,
      windowEnd: anchor,
      months: ms,
      periodMonths: [anchor],
      inPeriod: (ym: string) => ym === anchor,
    };
  }, [anchor, period]);

  const rollups = useRollups(ledgerId, windowStart, windowEnd);
  const byMonth = useMemo(() => new Map(rollups.map((r) => [r.yearMonth, r])), [rollups]);
  const agg = useMemo(
    () => sumRollups(rollups.filter((r) => inPeriod(r.yearMonth))),
    [rollups, inPeriod],
  );

  const modeTotal = mode === "expense" ? agg.expense : agg.income;
  const catMap = mode === "expense" ? agg.expenseByCategory : agg.incomeByCategory;
  const rows = useMemo(
    () =>
      Object.entries(catMap)
        .filter(([, v]) => v > 0)
        .map(([id, amount]) => ({ id, amount }))
        .sort((a, b) => b.amount - a.amount),
    [catMap],
  );

  // Donut slices: the top 6 categories keep distinct colors; the rest fold into
  // one neutral "Other" slice (dataviz: never cycle a categorical palette).
  const donut: Slice[] = useMemo(() => {
    const top = rows.slice(0, 6).map((r, i) => ({ label: r.id, value: r.amount, color: SLICE_COLORS[i] }));
    const rest = rows.slice(6).reduce((s, r) => s + r.amount, 0);
    return rest > 0 ? [...top, { label: UNCATEGORIZED, value: rest, color: OTHER_COLOR }] : top;
  }, [rows]);

  const trend: TrendPoint[] = useMemo(
    () =>
      months.map((ym) => ({
        ym,
        expense: byMonth.get(ym)?.expense ?? 0,
        income: byMonth.get(ym)?.income ?? 0,
      })),
    [months, byMonth],
  );

  // By-title breakdown — raw transactions for the period, only when its tab is open.
  const contentTx = useTransactionsForMonths(ledgerId, view === "content" ? periodMonths : []);
  const contentRows = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const tx of contentTx) {
      if (tx.type !== mode) continue;
      const key = tx.title.trim() || "—";
      const cur = m.get(key) ?? { total: 0, count: 0 };
      cur.total += tx.baseAmount;
      cur.count += 1;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [contentTx, mode]);

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

        {/* income / expense (tap to drive the breakdown) / net */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <ModeStat
            label={t("income")}
            minor={agg.income}
            locale={locale}
            active={mode === "income"}
            colorClass="text-sky-400"
            accent="#38bdf8"
            onClick={() => setMode("income")}
          />
          <ModeStat
            label={t("expense")}
            minor={agg.expense}
            locale={locale}
            active={mode === "expense"}
            colorClass="text-rose-400"
            accent="#fb7185"
            onClick={() => setMode("expense")}
          />
          <Stat label={t("net")} minor={agg.income - agg.expense} locale={locale} />
        </div>

        {/* view sub-tabs */}
        <div className="mt-3 flex gap-2 text-xs">
          {(["category", "trend", "content"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                "rounded-full px-3 py-1 " +
                (view === v ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400")
              }
            >
              {t(v === "category" ? "byCategory" : v === "trend" ? "trend" : "byContent")}
            </button>
          ))}
        </div>

        {view === "trend" ? (
          <TrendChart points={trend} selected={anchor} locale={locale} onSelect={selectTrendMonth} />
        ) : view === "content" ? (
          contentRows.length === 0 ? (
            <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-800">
              {contentRows.map((r) => (
                <li key={r.title} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 truncate text-slate-200">{r.title}</span>
                  <span className="tabular-nums text-slate-500">{r.count}</span>
                  <span className="w-24 text-right tabular-nums text-slate-200">
                    {formatMoney(r.total, BASE_CURRENCY, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : modeTotal === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <>
            <div className="mt-4">
              <CategoryDonut slices={donut} total={modeTotal} locale={locale} />
            </div>
            <ul className="mt-4 space-y-3">
              {rows.map((r, i) => {
                const cat =
                  r.id === UNCATEGORIZED ? undefined : categories.find((c) => c.id === r.id);
                const pct = Math.round((r.amount / modeTotal) * 100);
                const color = i < 6 ? SLICE_COLORS[i] : OTHER_COLOR;
                return (
                  <li key={r.id}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
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
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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

/** An income/expense total that doubles as the breakdown selector. The active
 *  one carries its semantic color + an underline; the other dims. */
function ModeStat({
  label,
  minor,
  locale,
  active,
  colorClass,
  accent,
  onClick,
}: {
  label: string;
  minor: number;
  locale: string;
  active: boolean;
  colorClass: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex flex-col items-center pb-1"
      style={{ borderBottom: `2px solid ${active ? accent : "transparent"}` }}
    >
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={
          "mt-0.5 text-base font-semibold tabular-nums " + (active ? colorClass : "text-slate-500")
        }
      >
        {formatMoney(minor, BASE_CURRENCY, locale)}
      </span>
    </button>
  );
}
