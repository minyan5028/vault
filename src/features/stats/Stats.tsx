import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { useRollups } from "../../data/useRollups";
import { useTransactionsForMonths } from "../../data/useTransactionsForMonths";
import { sumRollups } from "../../lib/rollup";
import type { LedgerEndpoint } from "../../lib/endpoints";
import {
  UNCATEGORIZED,
  type Category,
  type Project,
  type Transaction,
} from "../../domain/types";
import { Pill } from "../../components/Pill";
import { StatCell } from "../../components/StatCell";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { SLICE_COLORS, OTHER_COLOR, type Slice } from "./donutPalette";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { ContentList } from "./ContentList";
import { DrillView } from "./DrillView";
import { AppLogo } from "../../components/AppLogo";

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
export function Stats({
  ledgerId,
  endpoints,
  categories,
  projects,
  onEdit,
  onDelete,
}: {
  ledgerId: string;
  endpoints: ReadonlyMap<string, LedgerEndpoint>;
  categories: Category[];
  projects: Project[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<View>("category");
  // A tapped category / title row drills into its transactions for the period.
  const [drill, setDrill] = useState<{ kind: "category" | "title"; key: string; label: string } | null>(null);
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

  // Raw transactions for the period — needed by the by-title breakdown and any
  // drill-down (titles/rows aren't in the rollups). Loaded only when in use.
  const periodTx = useTransactionsForMonths(
    ledgerId,
    view === "content" || drill ? periodMonths : [],
  );
  const contentRows = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const tx of periodTx) {
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
  }, [periodTx, mode]);

  // Transactions behind the drilled-into category or title (period + mode).
  const drillTx = useMemo(() => {
    if (!drill) return [];
    return periodTx.filter((tx) => {
      if (tx.type !== mode) return false;
      return drill.kind === "category"
        ? (tx.categoryId ?? UNCATEGORIZED) === drill.key
        : (tx.title.trim() || "—") === drill.key;
    });
  }, [periodTx, drill, mode]);

  // Close a drill-down if the context it was opened in changes.
  useEffect(() => setDrill(null), [period, mode, anchor, view]);

  const shift = (d: number) => setAnchor((a) => shiftMonth(a, period === "year" ? d * 12 : d));
  const heading = period === "year" ? anchor.slice(0, 4) : monthLabel(anchor, locale);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        {drill ? (
          <DrillView
            label={drill.label}
            txns={drillTx}
            endpoints={endpoints}
            categories={categories}
            projects={projects}
            locale={locale}
            onBack={() => setDrill(null)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <>
        <header className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <AppLogo />
            <span className="text-lg font-semibold tracking-tight">{t("stats")}</span>
          </div>
          <div className="flex gap-1 text-xs">
            {(["month", "year"] as Period[]).map((p) => (
              <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>
                {t(p === "month" ? "periodMonth" : "periodYear")}
              </Pill>
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
            active={mode === "income"}
            colorClass="text-sky-400"
            accent="#38bdf8"
            onClick={() => setMode("income")}
          />
          <ModeStat
            label={t("expense")}
            minor={agg.expense}
            active={mode === "expense"}
            colorClass="text-rose-400"
            accent="#fb7185"
            onClick={() => setMode("expense")}
          />
          <StatCell label={t("net")} minor={agg.income - agg.expense} />
        </div>

        {/* view sub-tabs */}
        <div className="mt-3 flex gap-2 text-xs">
          {(["category", "trend", "content"] as View[]).map((v) => (
            <Pill key={v} active={view === v} onClick={() => setView(v)}>
              {t(v === "category" ? "byCategory" : v === "trend" ? "trend" : "byContent")}
            </Pill>
          ))}
        </div>

        {view === "trend" ? (
          <TrendChart points={trend} selected={anchor} locale={locale} />
        ) : view === "content" ? (
          <ContentList
            rows={contentRows}
            locale={locale}
            onDrill={(title) => setDrill({ kind: "title", key: title, label: title })}
          />
        ) : (
          <CategoryBreakdown
            rows={rows}
            donut={donut}
            total={modeTotal}
            categories={categories}
            locale={locale}
            onDrill={(key, label) => setDrill({ kind: "category", key, label })}
          />
        )}
          </>
        )}
      </div>
    </main>
  );
}

/** An income/expense total that doubles as the breakdown selector. The active
 *  one carries its semantic color + an underline; the other dims. */
function ModeStat({
  label,
  minor,
  active,
  colorClass,
  accent,
  onClick,
}: {
  label: string;
  minor: number;
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
      className="w-full pb-1"
      style={{ borderBottom: `2px solid ${active ? accent : "transparent"}` }}
    >
      <StatCell label={label} minor={minor} className={active ? colorClass : "text-slate-500"} />
    </button>
  );
}
