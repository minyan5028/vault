import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { portfolioTotals, toBase } from "../../lib/holdings";
import { useBalances } from "../../data/useBalances";
import { useHoldings } from "../../data/useHoldings";
import type { Account } from "../../domain/types";
import { Investments } from "./Investments";

const BASE_CURRENCY = "TWD";

/** Net worth = cash accounts (opening balance + net flow, from the balance
 *  rollup) + investment holdings valued into TWD. */
export function Assets({
  ledgerId,
  accounts,
  uid,
  onOpenAccount,
}: {
  ledgerId: string;
  accounts: Account[];
  uid: string;
  onOpenAccount: (account: Account, balance: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const netFlow = useBalances(ledgerId);
  const { holdings, fx } = useHoldings(ledgerId);
  const [showInvestments, setShowInvestments] = useState(false);

  const rows = accounts.map((a) => ({
    account: a,
    balance: a.openingBalance + (netFlow[a.id] ?? 0),
  }));
  // Net worth values each account's balance into TWD at the current rate (the
  // balance itself is in the account's own currency). Historical transaction
  // stats keep their entry-locked FX (ADR-0002) — this is presentation only.
  const cashTotal = rows.reduce((s, r) => s + toBase(r.balance, fx[r.account.currency] ?? 1), 0);
  const invest = useMemo(
    () => portfolioTotals(holdings.filter((h) => !h.archived), fx),
    [holdings, fx],
  );
  const netWorth = cashTotal + invest.valueBase;

  if (showInvestments) {
    return (
      <Investments
        ledgerId={ledgerId}
        accounts={accounts}
        uid={uid}
        onBack={() => setShowInvestments(false)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <header className="py-1">
          <span className="text-lg font-semibold tracking-tight">{t("assets")}</span>
        </header>

        <div className="mt-1 border-y border-slate-800 py-3 text-center">
          <p className="text-xs text-slate-500">{t("netWorth")}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {formatMoney(netWorth, BASE_CURRENCY, locale)}
          </p>
        </div>

        {/* Investments summary — tap to manage */}
        <button
          type="button"
          onClick={() => setShowInvestments(true)}
          className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-800/50 px-3 py-3 text-left active:bg-slate-800"
        >
          <div>
            <p className="text-sm text-slate-200">{t("investments")}</p>
            <p className="text-xs text-slate-500">
              {invest.gainBase >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(invest.gainBase), BASE_CURRENCY, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-slate-100">
              {formatMoney(invest.valueBase, BASE_CURRENCY, locale)}
            </span>
            <span className="text-slate-500">›</span>
          </div>
        </button>

        <h2 className="mt-4 text-xs uppercase tracking-wide text-slate-400">{t("cash")}</h2>
        <ul className="mt-1 divide-y divide-slate-800">
          {rows.map((r) => (
            <li key={r.account.id}>
              <button
                type="button"
                onClick={() => onOpenAccount(r.account, r.balance)}
                className="flex w-full items-center justify-between py-3 text-left active:bg-slate-800/50"
              >
                <span
                  className={"text-sm " + (r.account.archived ? "text-slate-500" : "text-slate-200")}
                >
                  {r.account.name}
                </span>
                <span className="text-sm tabular-nums text-slate-100">
                  {formatMoney(r.balance, r.account.currency, locale)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
