import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, toMinor, toMajor } from "../../lib/money";
import { transactionRepo } from "../../data/transactionRepo";
import { accountRepo } from "../../data/catalogRepo";
import type { Account, Transaction } from "../../domain/types";

const BASE_CURRENCY = "TWD";

/** Net worth: each account's balance = opening balance + net recorded flow. */
export function Assets({ ledgerId, accounts }: { ledgerId: string; accounts: Account[] }) {
  const { t, i18n } = useTranslation();
  const [txns, setTxns] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    transactionRepo
      .fetchAll(ledgerId)
      .then((x) => !cancelled && setTxns(x))
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [ledgerId]);

  const netFlow = useMemo(() => {
    const m = new Map<string, number>();
    const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
    for (const tx of txns ?? []) {
      if (tx.type === "expense") add(tx.accountId, -tx.baseAmount);
      else if (tx.type === "income") add(tx.accountId, tx.baseAmount);
      else if (tx.type === "transfer") {
        add(tx.accountId, -tx.baseAmount);
        if (tx.toAccountId) add(tx.toAccountId, tx.baseAmount);
      }
    }
    return m;
  }, [txns]);

  const loading = txns === null;
  const rows = accounts.map((a) => ({ account: a, balance: a.openingBalance + (netFlow.get(a.id) ?? 0) }));
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
            {loading ? "…" : formatMoney(total, BASE_CURRENCY, i18n.language)}
          </p>
        </div>

        <ul className="mt-2 divide-y divide-slate-800">
          {rows.map((r) => (
            <AccountRow
              key={r.account.id}
              ledgerId={ledgerId}
              account={r.account}
              balance={r.balance}
              loading={loading}
              locale={i18n.language}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}

function AccountRow({
  ledgerId,
  account,
  balance,
  loading,
  locale,
}: {
  ledgerId: string;
  account: Account;
  balance: number;
  loading: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const [openingText, setOpeningText] = useState(String(toMajor(account.openingBalance)));

  function commit() {
    let minor: number;
    try {
      minor = toMinor(openingText.trim() || "0");
    } catch {
      return;
    }
    if (minor !== account.openingBalance) {
      accountRepo.update(ledgerId, account.id, { openingBalance: minor });
    }
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between">
        <span className={"text-sm " + (account.archived ? "text-slate-500" : "text-slate-200")}>
          {account.name}
        </span>
        <span className="text-sm tabular-nums text-slate-100">
          {loading ? "…" : formatMoney(balance, BASE_CURRENCY, locale)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <label>{t("openingBalance")}</label>
        <input
          inputMode="decimal"
          value={openingText}
          onChange={(e) => setOpeningText(e.target.value.replace(/[^0-9.-]/g, ""))}
          onBlur={commit}
          className="w-28 rounded bg-slate-800 px-2 py-1 text-right text-slate-300 outline-none [color-scheme:dark]"
        />
      </div>
    </li>
  );
}
