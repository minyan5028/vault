import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { formatMoney } from "../../lib/money";
import { useRollups } from "../../data/useRollups";
import { useTransactionsForMonths } from "../../data/useTransactionsForMonths";
import { sumRollups, everydayExpense, everydayIncome, projectTotals } from "../../lib/rollup";
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
import { ProjectList } from "./ProjectList";
import { DrillView } from "./DrillView";
import { PageHeader } from "../../components/PageHeader";

type Period = "month" | "year";
type View = "category" | "trend" | "content" | "project";
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
  // A tapped Project row opens that Project's own category breakdown, one level
  // above `drill` — so backing out of a category returns to the Project.
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [openLabel, setOpenLabel] = useState("");
  // Everyday-only is a deliberate action, never the default: hiding a trip by
  // default would make the owner systematically underestimate their own
  // spending, which is the inverse of the problem Projects exist to solve.
  const [everydayOnly, setEverydayOnly] = useState(false);
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

  // The headline never moves; the split is shown beneath it and adds back up.
  const everydayTotal =
    mode === "expense" ? everydayExpense(agg) : everydayIncome(agg);
  const periodProjects = useMemo(() => projectTotals(agg), [agg]);
  const projectTotal = (mode === "expense" ? agg.expense : agg.income) - everydayTotal;

  const modeTotal = mode === "expense" ? agg.expense : agg.income;
  const catMap = mode === "expense" ? agg.expenseByCategory : agg.incomeByCategory;
  const rollupRows = useMemo(
    () =>
      Object.entries(catMap)
        .filter(([, v]) => v > 0)
        .map(([id, amount]) => ({ id, amount }))
        .sort((a, b) => b.amount - a.amount),
    [catMap],
  );

  const trend: TrendPoint[] = useMemo(
    () =>
      months.map((ym) => {
        const r = byMonth.get(ym);
        return {
          ym,
          expense: r?.expense ?? 0,
          income: r?.income ?? 0,
          everyday: r ? everydayExpense(r) : 0,
        };
      }),
    [months, byMonth],
  );

  // Raw transactions for the period — needed by the by-title breakdown and any
  // drill-down (titles/rows aren't in the rollups). Loaded only when in use.
  // The rollups carry no category×project cross-tab, so scoping the breakdown
  // to everyday-only or to one Project is the one thing here that cannot come
  // out of them. Those two views therefore read the period's transactions, on
  // demand and bounded — the same bargain the by-title view already makes.
  // Only the category breakdown consumes a scoped recomputation, so only it
  // should pay for the transaction read. The trend chart and the Project list
  // are answered entirely by the rollups; subscribing to a year of raw
  // transactions to render either would be a read for nothing. Everyday-only is
  // also a no-op in a period with no Project spending — everyday is the total —
  // so it must not survive navigating there and cost a read either.
  const showsBreakdown = view === "category" || (view === "project" && openProject !== null);
  const scoped =
    showsBreakdown && ((everydayOnly && projectTotal !== 0) || openProject !== null);
  const periodTx = useTransactionsForMonths(
    ledgerId,
    view === "content" || drill || scoped ? periodMonths : [],
  );

  /** True when a transaction belongs to whatever the screen is scoped to. */
  const inScope = useMemo(() => {
    if (openProject !== null) return (tx: Transaction) => tx.projectId === openProject;
    if (everydayOnly) return (tx: Transaction) => tx.projectId === null;
    return () => true;
  }, [openProject, everydayOnly]);

  // `null` means "not scoped"; it also covers "scoped but the transactions have
  // not landed yet", so the breakdown is withheld rather than drawn as an empty
  // donut around a real total.
  const scopedRows = useMemo(() => {
    if (!scoped || periodTx.length === 0) return null;
    const m = new Map<string, number>();
    for (const tx of periodTx) {
      if (tx.type !== mode || !inScope(tx)) continue;
      const key = tx.categoryId ?? UNCATEGORIZED;
      m.set(key, (m.get(key) ?? 0) + tx.baseAmount);
    }
    return [...m.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, amount]) => ({ id, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [scoped, periodTx, mode, inScope]);

  const awaitingScope = scoped && scopedRows === null;
  const rows = scopedRows ?? rollupRows;
  // Donut slices: the top 6 categories keep distinct colors; the rest fold into
  // one neutral "Other" slice (dataviz: never cycle a categorical palette).
  const donut: Slice[] = useMemo(() => {
    const top = rows.slice(0, 6).map((r, i) => ({ label: r.id, value: r.amount, color: SLICE_COLORS[i] }));
    const rest = rows.slice(6).reduce((s, r) => s + r.amount, 0);
    return rest > 0 ? [...top, { label: UNCATEGORIZED, value: rest, color: OTHER_COLOR }] : top;
  }, [rows]);

  // A Project stays open across a period change — navigating month by month
  // through a trip is the point — so a period it has no spending in must show
  // zero, not fall back to the period's whole figure under the Project's name.
  const openProjectTotal = periodProjects.find((p) => p.projectId === openProject);
  const breakdownTotal =
    openProject !== null
      ? openProjectTotal === undefined
        ? 0
        : mode === "expense"
          ? openProjectTotal.expense
          : openProjectTotal.income
      : everydayOnly
        ? everydayTotal
        : modeTotal;
  const contentRows = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const tx of periodTx) {
      // Must honour the same scope as the drill behind each row, or a row reads
      // 5,000 and opening it lists 2,000.
      if (tx.type !== mode || !inScope(tx)) continue;
      const key = tx.title.trim() || "—";
      const cur = m.get(key) ?? { total: 0, count: 0 };
      cur.total += tx.baseAmount;
      cur.count += 1;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [periodTx, mode, inScope]);

  // Transactions behind the drilled-into category or title (period + mode).
  const drillTx = useMemo(() => {
    if (!drill) return [];
    return periodTx.filter((tx) => {
      if (tx.type !== mode) return false;
      if (!inScope(tx)) return false;
      return drill.kind === "category"
        ? (tx.categoryId ?? UNCATEGORIZED) === drill.key
        : (tx.title.trim() || "—") === drill.key;
    });
  }, [periodTx, drill, mode, inScope]);

  // Close a drill-down if the context it was opened in changes.
  useEffect(() => setDrill(null), [period, mode, anchor, view, openProject, everydayOnly]);
  // A drill key, an open Project and its label are ids belonging to the Ledger
  // they were opened in. Switching Ledger would leave the heading naming a
  // Category this Ledger does not have, over rows filtered by an id nothing
  // here carries. The period, view and mode mean the same thing in any Ledger
  // and deliberately survive.
  useEffect(() => {
    setDrill(null);
    setOpenProject(null);
    setOpenLabel("");
  }, [ledgerId]);
  // Leaving the Project view closes the Project being reviewed.
  useEffect(() => {
    if (view !== "project") setOpenProject(null);
  }, [view]);
  // Everyday-only cannot mean anything in a period with no Project spending.
  // Clear the state, not just its effect, so navigating away and back does not
  // silently switch it on again.
  useEffect(() => {
    if (projectTotal === 0) setEverydayOnly(false);
  }, [projectTotal]);

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
        <PageHeader>
          <div className="flex gap-1 text-xs">
            {(["month", "year"] as Period[]).map((p) => (
              <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>
                {t(p === "month" ? "periodMonth" : "periodYear")}
              </Pill>
            ))}
          </div>
        </PageHeader>

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

        {/* The split. The headline above never moves — these two add back up to
            it — so the owner is never misled about what they actually spent,
            while a travel month becomes comparable to one without a trip. */}
        {projectTotal !== 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 tabular-nums text-slate-400">
              <span>
                {t("everyday")}{" "}
                <span className="text-slate-200">{formatMoney(everydayTotal, "TWD", locale)}</span>
              </span>
              <button
                type="button"
                onClick={() => setView("project")}
                className="flex items-center gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t("projects")}{" "}
                <span className="text-slate-200">{formatMoney(projectTotal, "TWD", locale)}</span>
              </button>
            </div>
            {view === "category" && (
              <Pill active={everydayOnly} onClick={() => setEverydayOnly((v) => !v)}>
                {t("everydayOnly")}
              </Pill>
            )}
          </div>
        )}

        {/* view sub-tabs */}
        <div className="mt-3 flex gap-2 text-xs">
          {(["category", "trend", "content", "project"] as View[]).map((v) => (
            <Pill key={v} active={view === v} onClick={() => setView(v)}>
              {t(
                v === "category"
                  ? "byCategory"
                  : v === "trend"
                    ? "trend"
                    : v === "content"
                      ? "byContent"
                      : "projects",
              )}
            </Pill>
          ))}
        </div>

        {view === "project" ? (
          openProject === null ? (
            <ProjectList
              totals={periodProjects}
              projects={projects}
              mode={mode}
              locale={locale}
              onOpen={(id, label) => {
                setOpenProject(id);
                setOpenLabel(label);
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOpenProject(null)}
                className="mt-3 flex items-center gap-1 text-xs text-slate-400"
              >
                ‹ {openLabel}
              </button>
              {/* Nothing at all while the scoped read is in flight — a zero
                  total would render "no entries yet", which is a claim. */}
              {!awaitingScope && (
                <CategoryBreakdown
                  rows={rows}
                  donut={donut}
                  total={breakdownTotal}
                  categories={categories}
                  locale={locale}
                  onDrill={(key, label) => setDrill({ kind: "category", key, label })}
                />
              )}
            </>
          )
        ) : view === "trend" ? (
          <TrendChart points={trend} selected={anchor} locale={locale} />
        ) : view === "content" ? (
          <ContentList
            rows={contentRows}
            locale={locale}
            onDrill={(title) => setDrill({ kind: "title", key: title, label: title })}
          />
        ) : (
          !awaitingScope && (
            <CategoryBreakdown
              rows={rows}
              donut={donut}
              total={breakdownTotal}
              categories={categories}
              locale={locale}
              onDrill={(key, label) => setDrill({ kind: "category", key, label })}
            />
          )
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
