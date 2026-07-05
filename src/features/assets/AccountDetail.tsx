import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth, monthLabel } from "../../lib/date";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import type { Account, Category, Transaction } from "../../domain/types";
import { EntryRow, groupByDay, dayLabel } from "../timeline/Timeline";

const BASE_CURRENCY = "TWD";

/** One account's transactions — the Timeline scoped to a single account (v1). */
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
  const txns = useMonthTransactions(ledgerId, month);

  const mine = useMemo(
    () => txns.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id),
    [txns, account.id],
  );
  const { deposits, withdrawals } = useMemo(() => {
    let dep = 0;
    let wd = 0;
    for (const tx of mine) {
      if (tx.toAccountId === account.id && tx.type === "transfer") dep += tx.baseAmount;
      if (tx.accountId === account.id) {
        if (tx.type === "income") dep += tx.baseAmount;
        else wd += tx.baseAmount; // expense or transfer-out
      }
    }
    return { deposits: dep, withdrawals: wd };
  }, [mine, account.id]);
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

        {/* Deposits / Withdrawals / Balance */}
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
