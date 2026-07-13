import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../../lib/money";
import type { Account } from "../../../domain/types";
import { BASE_CURRENCY, inputClass } from "./shared";

/** Gain shown green when positive, rose when negative. */
export function Gain({
  minor,
  currency,
  locale,
}: {
  minor: number;
  currency?: string;
  locale: string;
}) {
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "";
  const color = minor > 0 ? "text-emerald-400" : minor < 0 ? "text-rose-400" : "text-slate-400";
  return (
    <span className={"tabular-nums " + color}>
      {sign}
      {formatMoney(Math.abs(minor), currency ?? BASE_CURRENCY, locale)}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Picks the cash account a trade's money moves through — filtered to the
 *  holding's currency. Empty value = record no cash leg. */
export function CashAccountField({
  label,
  accounts,
  currency,
  value,
  onChange,
}: {
  label: string;
  accounts: Account[];
  currency: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const opts = accounts.filter((a) => !a.archived && a.currency === currency);
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("noCashLeg")}</option>
        {opts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
