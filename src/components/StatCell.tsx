import { useTranslation } from "react-i18next";
import { formatMoney } from "../lib/money";

/** A labelled money figure (summary cell). */
export function StatCell({
  label,
  minor,
  className = "text-slate-100",
  currency = "TWD",
}: {
  label: string;
  minor: number;
  className?: string;
  currency?: string;
}) {
  const { i18n } = useTranslation();
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold tabular-nums " + className}>
        {formatMoney(minor, currency, i18n.language)}
      </p>
    </div>
  );
}
