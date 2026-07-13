import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toDateInputValue } from "../../../lib/date";
import type { Holding, SnapshotEntry } from "../../../domain/types";
import { BASE_CURRENCY, inputClass, toMinor, toShares, fromMinor, fromShares } from "./shared";
import { Field } from "./fields";

/**
 * Record a valuation snapshot, grouped by currency so each group updates on its
 * own schedule (TWD and USD holdings rarely update the same day). Submitting a
 * group writes only that group's holdings + its FX rate; other holdings keep
 * their previous pricedAt. Same-date groups merge into one snapshot.
 */
export function UpdatePricesForm({
  holdings,
  fx,
  onSave,
  onClose,
}: {
  holdings: Holding[];
  fx: Record<string, number>;
  onSave: (snap: {
    date: string;
    entries: Record<string, SnapshotEntry>;
    fx: Record<string, number>;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map((h) => [h.id, fromMinor(h.price)])),
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map((h) => [h.id, fromShares(h.shares)])),
  );
  const currencies = [...new Set(holdings.map((h) => h.currency))];
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(currencies.map((c) => [c, (fx[c] ?? "").toString()])),
  );
  const [savedCur, setSavedCur] = useState<string | null>(null);

  async function submitGroup(cur: string) {
    const group = holdings.filter((h) => h.currency === cur);
    const entries: Record<string, SnapshotEntry> = {};
    for (const h of group)
      entries[h.id] = { price: toMinor(prices[h.id]), shares: toShares(shares[h.id]) };
    const fxOut: Record<string, number> = {};
    if (cur !== BASE_CURRENCY) fxOut[cur] = parseFloat(rates[cur] || "0") || 0;
    await onSave({ date, entries, fx: fxOut });
    setSavedCur(cur);
    setTimeout(() => setSavedCur((c) => (c === cur ? null : c)), 1500);
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-800/40 p-3">
      <Field label={t("date")}>
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      {currencies.map((cur) => {
        const group = holdings.filter((h) => h.currency === cur);
        return (
          <section key={cur} className="rounded-md bg-slate-800/40 p-2">
            <div className="mb-1 flex items-end justify-between gap-2">
              <h3 className="text-xs uppercase tracking-wide text-slate-400">{cur}</h3>
              {cur !== BASE_CURRENCY && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  {cur} → {BASE_CURRENCY}
                  <input
                    className="w-20 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
                    inputMode="decimal"
                    value={rates[cur] ?? ""}
                    onChange={(e) => setRates((r) => ({ ...r, [cur]: e.target.value }))}
                  />
                </label>
              )}
            </div>
            <ul className="space-y-2">
              {group.map((h) => (
                <li key={h.id} className="flex items-end gap-2">
                  <span className="w-14 shrink-0 truncate pb-1.5 text-sm text-slate-300">
                    {h.ticker}
                  </span>
                  <Field label={t("price")}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={prices[h.id] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [h.id]: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("shares")}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={shares[h.id] ?? ""}
                      onChange={(e) => setShares((s) => ({ ...s, [h.id]: e.target.value }))}
                    />
                  </Field>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => submitGroup(cur)}
                className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-emerald-400"
              >
                {savedCur === cur ? `✓ ${cur}` : t("updateCurrency", { cur })}
              </button>
            </div>
          </section>
        );
      })}

      <div className="flex justify-end pt-1 text-sm">
        <button type="button" onClick={onClose} className="text-slate-400">
          {t("close")}
        </button>
      </div>
    </div>
  );
}
