import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { yearMonthOf, shiftMonth } from "../../lib/date";
import { groupByDay, dayLabel } from "../../lib/grouping";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import { transactionRepo } from "../../data/transactionRepo";
import { effectOn, depositsWithdrawals, runningBalances } from "../../lib/balance";
import { MonthSelector } from "../../components/MonthSelector";
import { StatCell } from "../../components/StatCell";
import { EntryRow } from "../../components/EntryRow";
import type { Account, Category, Transaction } from "../../domain/types";

/** One account's transactions — the Timeline scoped to a single account, with
 *  per-row running balance. */
export function AccountDetail({
  ledgerId,
  account,
  balance,
  accounts,
  categories,
  onEdit,
  onDelete,
  onBack,
}: {
  ledgerId: string;
  account: Account;
  balance: number;
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const [allTxns, setAllTxns] = useState<Transaction[] | null>(null);
  const monthTxns = useMonthTransactions(ledgerId, month);

  // One-shot history (for the balance carried into the viewed month).
  useEffect(() => {
    let cancelled = false;
    transactionRepo
      .fetchAll(ledgerId)
      .then((x) => !cancelled && setAllTxns(x))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [ledgerId]);

  const mine = useMemo(
    () => monthTxns.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id),
    [monthTxns, account.id],
  );
  const { deposits, withdrawals } = useMemo(
    () => depositsWithdrawals(mine, account.id),
    [mine, account.id],
  );

  // Running balance: opening + all prior-month effects, then cumulate within the
  // month in chronological order (live, so edits reflect).
  const runningMap = useMemo(() => {
    if (allTxns === null) return new Map<string, number>();
    let before = account.openingBalance;
    for (const tx of allTxns) if (tx.yearMonth < month) before += effectOn(tx, account.id);
    const asc = [...mine].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return runningBalances(asc, account.id, before);
  }, [allTxns, mine, month, account.id, account.openingBalance]);

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
          <StatCell label={t("deposits")} minor={deposits} className="text-sky-400" />
          <StatCell label={t("withdrawals")} minor={withdrawals} className="text-rose-400" />
          <StatCell label={t("balance")} minor={balance} />
        </div>

        {mine.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                  {dayLabel(day, locale, t)}
                </h2>
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
                      runningBalance={runningMap.get(e.id)}
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
