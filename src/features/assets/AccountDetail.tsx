import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import { transactionRepo } from "../../data/transactionRepo";
import type { Account, Category, Transaction } from "../../domain/types";
import { EntryRow, groupByDay, dayLabel } from "../timeline/Timeline";

const BASE_CURRENCY = "TWD";

/** Effect of a transaction on this account's balance (minor units, signed). */
function effectOn(tx: Transaction, accId: string): number {
  let e = 0;
  if (tx.accountId === accId) e += tx.type === "income" ? tx.baseAmount : -tx.baseAmount;
  if (tx.type === "transfer" && tx.toAccountId === accId) e += tx.baseAmount;
  return e;
}

/** One account's transactions — the Timeline scoped to a single account, with
 *  per-row running balance (v2). */
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

  const { deposits, withdrawals } = useMemo(() => {
    let dep = 0;
    let wd = 0;
    for (const tx of mine) {
      if (tx.toAccountId === account.id && tx.type === "transfer") dep += tx.baseAmount;
      if (tx.accountId === account.id) {
        if (tx.type === "income") dep += tx.baseAmount;
        else wd += tx.baseAmount;
      }
    }
    return { deposits: dep, withdrawals: wd };
  }, [mine, account.id]);

  // Running balance per row: opening + all prior-month effects, then cumulate
  // within the month in chronological order (live, so edits reflect).
  const runningMap = useMemo(() => {
    const map = new Map<string, number>();
    if (allTxns === null) return map;
    let running = account.openingBalance;
    for (const tx of allTxns) if (tx.yearMonth < month) running += effectOn(tx, account.id);
    const asc = [...mine].sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const tx of asc) {
      running += effectOn(tx, account.id);
      map.set(tx.id, running);
    }
    return map;
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

        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <Cell label={t("deposits")} minor={deposits} color="text-sky-400" locale={locale} />
          <Cell label={t("withdrawals")} minor={withdrawals} color="text-rose-400" locale={locale} />
          <Cell label={t("balance")} minor={balance} color="text-slate-100" locale={locale} />
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

function Cell({
  label,
  minor,
  color,
  locale,
}: {
  label: string;
  minor: number;
  color: string;
  locale: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold tabular-nums " + color}>
        {formatMoney(minor, BASE_CURRENCY, locale)}
      </p>
    </div>
  );
}
