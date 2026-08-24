import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth, fromDateInputValue } from "../../lib/date";
import { groupByDay, dayLabel } from "../../lib/grouping";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import { MonthSelector } from "../../components/MonthSelector";
import { StatCell } from "../../components/StatCell";
import { EntryRow } from "../../components/EntryRow";
import { PageHeader } from "../../components/PageHeader";
import { useLedgerNav } from "../../components/ledgerNav";
import { Pill } from "../../components/Pill";
import type { LedgerEndpoint } from "../../lib/endpoints";
import type { Account, Category, Project, EventType, Transaction } from "../../domain/types";

const FILTERS: ("all" | EventType)[] = ["all", "expense", "income", "transfer"];
const BASE_CURRENCY = "TWD";

/**
 * The home screen: a month of Financial Events (live from Firestore) grouped by
 * day, with an income/expense/total summary and per-day subtotals (docs/UX.md).
 */
export function Timeline({
  ledgerId,
  currentUid,
  accounts,
  endpoints,
  categories,
  projects,
  onEdit,
  onAddOnDate,
  onDelete,
}: {
  ledgerId: string;
  currentUid: string;
  accounts: Account[];
  endpoints: ReadonlyMap<string, LedgerEndpoint>;
  categories: Category[];
  projects: Project[];
  onEdit: (tx: Transaction) => void;
  /** Tap a day heading to record another event on that day. */
  onAddOnDate: (date: Date) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const [filter, setFilter] = useState<"all" | EventType>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const txns = useMonthTransactions(ledgerId, month);

  // Attribution: only meaningful in a shared ledger, and shown for others' entries.
  const { active: activeLedger } = useLedgerNav();
  const shared = (activeLedger?.memberIds.length ?? 0) > 1;
  const authorNameFor = (uid: string): string | undefined => {
    if (!shared || uid === currentUid) return undefined;
    const p = activeLedger?.memberProfiles[uid];
    return p?.name || p?.email || undefined;
  };

  // Filters run on the loaded month (instant, no extra reads); the summary
  // reflects whatever is currently in view.
  const q = query.trim().toLowerCase();
  const filtersActive = filter !== "all" || categoryId !== "" || accountId !== "" || q !== "";
  const filtered = useMemo(
    () =>
      txns.filter((tx) => {
        if (filter !== "all" && tx.type !== filter) return false;
        if (categoryId && tx.categoryId !== categoryId) return false;
        if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false;
        if (q && !tx.title.toLowerCase().includes(q) && !(tx.note ?? "").toLowerCase().includes(q))
          return false;
        return true;
      }),
    [txns, filter, categoryId, accountId, q],
  );
  const summary = useMemo(() => totals(filtered), [filtered]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const clearFilters = () => {
    setFilter("all");
    setQuery("");
    setCategoryId("");
    setAccountId("");
  };
  const activeCategories = categories.filter((c) => !c.archived);
  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <PageHeader />

        <MonthSelector month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />

        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <StatCell label={t("income")} minor={summary.income} className="text-sky-400" />
          <StatCell label={t("expense")} minor={summary.expense} className="text-rose-400" />
          <StatCell label={t("total")} minor={summary.net} />
        </div>

        {/* Type filter + search/filter toggle */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <div className="flex flex-1 gap-2">
            {FILTERS.map((f) => (
              <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? t("all") : t(`type_${f}` as "type_expense")}
              </Pill>
            ))}
          </div>
          <Pill
            active={showFilters || filtersActive}
            onClick={() => setShowFilters((v) => !v)}
            ariaLabel={t("search")}
          >
            🔍
          </Pill>
        </div>

        {showFilters && (
          <div className="mt-2 space-y-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <div className="flex gap-2 text-sm">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-2 text-slate-200"
              >
                <option value="">{t("allCategories")}</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-2 text-slate-200"
              >
                <option value="">{t("allAccounts")}</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-slate-400 underline"
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-20 text-center text-slate-600">
            <div className="text-4xl">{filtersActive ? "🔍" : "💰"}</div>
            <p className="mt-3 text-sm">{filtersActive ? t("noResults") : t("empty")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => (
              <section key={day}>
                <button
                  type="button"
                  onClick={() => onAddOnDate(fromDateInputValue(day))}
                  aria-label={t("addOnDay", { day: dayLabel(day, locale, t) })}
                  className="mb-1 flex w-full items-center justify-between text-xs active:opacity-60"
                >
                  <span className="uppercase tracking-wide text-slate-400">
                    {dayLabel(day, locale, t)}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {formatMoney(totals(items).net, BASE_CURRENCY, locale)}
                  </span>
                </button>
                <ul className="divide-y divide-slate-800">
                  {items.map((e) => (
                    <EntryRow
                      key={e.id}
                      tx={e}
                      locale={locale}
                      endpoints={endpoints}
                      categories={categories}
                      projects={projects}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      authorName={authorNameFor(e.createdBy)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/** Income/expense/net totals in minor units (transfers excluded from spend). */
function totals(items: Transaction[]): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const e of items) {
    if (e.type === "income") income += e.baseAmount;
    else if (e.type === "expense") expense += e.baseAmount;
  }
  return { income, expense, net: income - expense };
}
