import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { useBalances } from "../../data/useBalances";
import type { Account } from "../../domain/types";

const BASE_CURRENCY = "TWD";

/** Net worth: each account's balance = opening balance + net recorded flow.
 *  Balances come from the ledger's maintained rollup (one doc), not a full scan. */
export function Assets({
  ledgerId,
  accounts,
  onOpenAccount,
}: {
  ledgerId: string;
  accounts: Account[];
  onOpenAccount: (account: Account, balance: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const netFlow = useBalances(ledgerId);

  const rows = accounts.map((a) => ({ account: a, balance: a.openingBalance + (netFlow[a.id] ?? 0) }));
  const total = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <header className="py-1">
          <span className="text-lg font-semibold tracking-tight">{t("assets")}</span>
        </header>

        <div className="mt-1 border-y border-slate-800 py-3 text-center">
          <p className="text-xs text-slate-500">{t("totalAssets")}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {formatMoney(total, BASE_CURRENCY, i18n.language)}
          </p>
        </div>

        <ul className="mt-2 divide-y divide-slate-800">
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
                  {formatMoney(r.balance, BASE_CURRENCY, i18n.language)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
