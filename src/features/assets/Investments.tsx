import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { valueHolding, portfolioTotals, toBase } from "../../lib/holdings";
import { holdingRepo } from "../../data/holdingRepo";
import { useHoldings } from "../../data/useHoldings";
import { useSnapshots } from "../../data/useSnapshots";
import type { Account } from "../../domain/types";
import { BASE_CURRENCY, CLASSES, fromShares } from "./investments/shared";
import { Gain } from "./investments/fields";
import { ValueTrend } from "./investments/ValueTrend";
import { AddHoldingForm } from "./investments/AddHoldingForm";
import { UpdatePricesForm } from "./investments/UpdatePricesForm";
import { HoldingDetail } from "./investments/HoldingDetail";

/** Manage market-valued positions: view value/gain by class, add a holding,
 *  record a periodic valuation snapshot, and open a holding to buy/sell. */
export function Investments({
  ledgerId,
  accounts,
  uid,
  onBack,
}: {
  ledgerId: string;
  accounts: Account[];
  uid: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { holdings, fx } = useHoldings(ledgerId);
  const snapshots = useSnapshots(ledgerId);
  const active = useMemo(() => holdings.filter((h) => !h.archived), [holdings]);
  const totals = useMemo(() => portfolioTotals(active, fx), [active, fx]);
  const dividendBase = useMemo(
    () => active.reduce((s, h) => s + toBase(h.dividendReceived, fx[h.currency] ?? 1), 0),
    [active, fx],
  );
  const [panel, setPanel] = useState<"none" | "add" | "update">("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = active.find((h) => h.id === selectedId);
  if (selected) {
    return (
      <HoldingDetail
        ledgerId={ledgerId}
        holding={selected}
        accounts={accounts}
        fx={fx}
        uid={uid}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex items-center gap-1 py-2 text-sm text-slate-400"
        >
          <span className="text-lg leading-none">‹</span>
          {t("assets")}
        </button>

        <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
          <span className="text-lg font-semibold tracking-tight">{t("investments")}</span>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(totals.valueBase, BASE_CURRENCY, locale)}
            </p>
            <Gain minor={totals.gainBase} locale={locale} />
          </div>
        </div>
        {totals.realizedBase !== 0 && (
          <p className="mt-1 text-right text-xs text-slate-500">
            {t("realizedGain")} <Gain minor={totals.realizedBase} locale={locale} />
          </p>
        )}
        {dividendBase > 0 && (
          <p className="mt-0.5 text-right text-xs text-slate-500">
            {t("dividendReceived")}{" "}
            <span className="tabular-nums text-sky-400">
              {formatMoney(dividendBase, BASE_CURRENCY, locale)}
            </span>
          </p>
        )}

        <ValueTrend snapshots={snapshots} holdings={holdings} fx={fx} locale={locale} />

        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPanel(panel === "add" ? "none" : "add")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
          >
            + {t("addHolding")}
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "update" ? "none" : "update")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
            disabled={active.length === 0}
          >
            {t("updatePrices")}
          </button>
        </div>

        {panel === "add" && (
          <AddHoldingForm
            accounts={accounts}
            onCancel={() => setPanel("none")}
            onSave={async (h) => {
              await holdingRepo.add(ledgerId, h, uid);
              setPanel("none");
            }}
          />
        )}
        {panel === "update" && (
          <UpdatePricesForm
            holdings={active}
            fx={fx}
            onClose={() => setPanel("none")}
            onSave={(snap) => holdingRepo.addSnapshot(ledgerId, snap)}
          />
        )}

        {active.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("noHoldings")}</p>
        ) : (
          CLASSES.map((cls) => {
            const rows = active.filter((h) => h.class === cls);
            if (rows.length === 0) return null;
            const sub = totals.byClass[cls];
            return (
              <section key={cls} className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <h2 className="uppercase tracking-wide text-slate-400">{t(`class_${cls}`)}</h2>
                  <span className="tabular-nums text-slate-500">
                    {formatMoney(sub.valueBase, BASE_CURRENCY, locale)} ·{" "}
                    <Gain minor={sub.gainBase} locale={locale} />
                  </span>
                </div>
                <ul className="divide-y divide-slate-800">
                  {rows.map((h) => {
                    const v = valueHolding(h, fx);
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(h.id)}
                          className="flex w-full items-center gap-3 py-2 text-left text-sm active:bg-slate-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-slate-200">{h.ticker}</p>
                            <p className="text-xs text-slate-500">
                              {fromShares(h.shares)} × {formatMoney(h.price, h.currency, locale)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular-nums text-slate-100">
                              {formatMoney(v.valueBase, BASE_CURRENCY, locale)}
                            </p>
                            <Gain minor={v.gainBase} locale={locale} />
                          </div>
                          <span className="text-slate-600">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
