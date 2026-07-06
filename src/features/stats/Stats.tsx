import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { yearMonthOf, shiftMonth } from "../../lib/date";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import { MonthSelector } from "../../components/MonthSelector";
import type { Category } from "../../domain/types";

const BASE_CURRENCY = "TWD";

/** Monthly expense breakdown by category (see roadmap Phase 3). */
export function Stats({ ledgerId, categories }: { ledgerId: string; categories: Category[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const txns = useMonthTransactions(ledgerId, month);

  const { total, rows } = useMemo(() => {
    const sums = new Map<string, number>();
    let total = 0;
    for (const tx of txns) {
      if (tx.type !== "expense") continue;
      total += tx.baseAmount;
      const key = tx.categoryId ?? "uncategorized";
      sums.set(key, (sums.get(key) ?? 0) + tx.baseAmount);
    }
    const rows = [...sums.entries()]
      .map(([id, amount]) => ({ id, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { total, rows };
  }, [txns]);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <header className="py-1">
          <span className="text-lg font-semibold tracking-tight">{t("stats")}</span>
        </header>

        <MonthSelector month={month} onShift={(d) => setMonth((m) => shiftMonth(m, d))} />

        {/* Total expense */}
        <div className="border-y border-slate-800 py-3 text-center">
          <p className="text-xs text-slate-500">{t("expense")}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-rose-400">
            {formatMoney(total, BASE_CURRENCY, locale)}
          </p>
        </div>

        {/* Category breakdown */}
        {total === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => {
              const cat = categories.find((c) => c.id === r.id);
              const pct = Math.round((r.amount / total) * 100);
              return (
                <li key={r.id}>
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="text-base">{cat?.icon ?? "•"}</span>
                    <span className="flex-1 truncate text-slate-200">
                      {cat?.name ?? t("uncategorized")}
                    </span>
                    <span className="tabular-nums text-slate-400">{pct}%</span>
                    <span className="w-24 text-right tabular-nums text-slate-200">
                      {formatMoney(r.amount, BASE_CURRENCY, locale)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
