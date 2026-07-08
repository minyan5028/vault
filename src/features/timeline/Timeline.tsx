import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth } from "../../lib/date";
import { groupByDay, dayLabel } from "../../lib/grouping";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import { MonthSelector } from "../../components/MonthSelector";
import { StatCell } from "../../components/StatCell";
import { EntryRow } from "../../components/EntryRow";
import { LedgerSwitcher } from "../../components/LedgerSwitcher";
import type { Account, Category, EventType, Ledger, Transaction } from "../../domain/types";

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
  categories,
  ledgers,
  invites,
  onSelectLedger,
  onCreateLedger,
  onAcceptInvite,
  onEdit,
  onDelete,
}: {
  ledgerId: string;
  currentUid: string;
  accounts: Account[];
  categories: Category[];
  ledgers: Ledger[];
  invites: Ledger[];
  onSelectLedger: (id: string) => void;
  onCreateLedger: (name: string) => void;
  onAcceptInvite: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const [filter, setFilter] = useState<"all" | EventType>("all");
  const txns = useMonthTransactions(ledgerId, month);

  // Attribution: only meaningful in a shared ledger, and shown for others' entries.
  const activeLedger = ledgers.find((l) => l.id === ledgerId);
  const shared = (activeLedger?.memberIds.length ?? 0) > 1;
  const authorNameFor = (uid: string): string | undefined => {
    if (!shared || uid === currentUid) return undefined;
    const p = activeLedger?.memberProfiles[uid];
    return p?.name || p?.email || undefined;
  };

  const summary = useMemo(() => totals(txns), [txns]);
  const filtered = useMemo(
    () => (filter === "all" ? txns : txns.filter((t) => t.type === filter)),
    [txns, filter],
  );
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28">
        <header className="py-3">
          <LedgerSwitcher
            ledgers={ledgers}
            activeId={ledgerId}
            invites={invites}
            onSelect={onSelectLedger}
            onCreate={onCreateLedger}
            onAccept={onAcceptInvite}
          />
        </header>

        <MonthSelector month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />

        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <StatCell label={t("income")} minor={summary.income} className="text-sky-400" />
          <StatCell label={t("expense")} minor={summary.expense} className="text-rose-400" />
          <StatCell label={t("total")} minor={summary.net} />
        </div>

        {/* Type filter */}
        <div className="mt-3 flex gap-2 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-full px-3 py-1 " +
                (filter === f ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-400")
              }
            >
              {f === "all" ? t("all") : t(`type_${f}` as "type_expense")}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-20 text-center text-slate-600">
            <div className="text-4xl">💰</div>
            <p className="mt-3 text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => (
              <section key={day}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <h2 className="uppercase tracking-wide text-slate-400">
                    {dayLabel(day, locale, t)}
                  </h2>
                  <span className="tabular-nums text-slate-500">
                    {formatMoney(totals(items).net, BASE_CURRENCY, locale)}
                  </span>
                </div>
                <ul className="divide-y divide-slate-800">
                  {items.map((e) => (
                    <EntryRow
                      key={e.id}
                      tx={e}
                      locale={locale}
                      accounts={accounts}
                      categories={categories}
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
