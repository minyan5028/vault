import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { yearMonthOf, shiftMonth, fromDateInputValue } from "../../lib/date";
import { groupByDay, dayLabel } from "../../lib/grouping";
import { useAccountTransactions } from "../../data/useAccountTransactions";
import { balanceAsOfMonth, depositsWithdrawals, runningBalances } from "../../lib/balance";
import { MonthSelector } from "../../components/MonthSelector";
import { StatCell } from "../../components/StatCell";
import { EntryRow } from "../../components/EntryRow";
import type { LedgerEndpoint } from "../../lib/endpoints";
import type { Account, Category, Transaction } from "../../domain/types";

/** One account's transactions — scoped to that account (no full-ledger scan),
 *  with per-row running balance and a closing balance for the selected month,
 *  both derived from that history (never from the ledger's rollup cache). */
export function AccountDetail({
  ledgerId,
  account,
  endpoints,
  categories,
  onEdit,
  onAddOnDate,
  onDelete,
  onBack,
}: {
  ledgerId: string;
  account: Account;
  endpoints: ReadonlyMap<string, LedgerEndpoint>;
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  /** Tap a day heading to record another event on that day, in this account. */
  onAddOnDate: (date: Date) => void;
  onDelete: (tx: Transaction) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const history = useAccountTransactions(ledgerId, account.id); // newest first

  const mine = useMemo(() => history.filter((tx) => tx.yearMonth === month), [history, month]);
  const { deposits, withdrawals } = useMemo(
    () => depositsWithdrawals(mine, account.id),
    [mine, account.id],
  );

  // Closing balance for the month on screen, derived from this account's own
  // history rather than the `balance` prop (the ledger-wide rollup cache): the
  // figure has to follow the month selector, and deriving it keeps this view
  // correct even if the cache drifts. For the current month the two agree.
  const closing = useMemo(
    () => balanceAsOfMonth(history, account.id, account.openingBalance, month),
    [history, account.id, account.openingBalance, month],
  );
  const isCurrentMonth = month === yearMonthOf(new Date());

  // Running balance from the full account history (oldest first), keyed by id.
  const runningMap = useMemo(() => {
    const asc = [...history].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return runningBalances(asc, account.id, account.openingBalance);
  }, [history, account.id, account.openingBalance]);

  const groups = groupByDay(mine);

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-10 pt-4">
        <header className="mb-1 flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("assets")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ‹
          </button>
          <span className="text-lg font-semibold tracking-tight">{account.name}</span>
        </header>

        <MonthSelector month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />

        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <StatCell label={t("deposits")} minor={deposits} className="text-sky-400" currency={account.currency} />
          <StatCell label={t("withdrawals")} minor={withdrawals} className="text-rose-400" currency={account.currency} />
          <StatCell
            label={isCurrentMonth ? t("balance") : t("closingBalance")}
            minor={closing}
            currency={account.currency}
          />
        </div>

        {mine.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => (
              <section key={day}>
                <button
                  type="button"
                  onClick={() => onAddOnDate(fromDateInputValue(day))}
                  aria-label={t("addOnDay", { day: dayLabel(day, locale, t) })}
                  className="mb-1 flex w-full text-xs uppercase tracking-wide text-slate-400 active:opacity-60"
                >
                  {dayLabel(day, locale, t)}
                </button>
                <ul className="divide-y divide-slate-800">
                  {items.map((e) => (
                    <EntryRow
                      key={e.id}
                      tx={e}
                      locale={locale}
                      endpoints={endpoints}
                      categories={categories}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      runningBalance={runningMap.get(e.id)}
                      viewAccount={account}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
