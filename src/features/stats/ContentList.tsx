import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";

const BASE_CURRENCY = "TWD";

/** Expenses/income grouped by title (count + total), sorted. Tap to drill in. */
export function ContentList({
  rows,
  locale,
  onDrill,
}: {
  rows: { title: string; count: number; total: number }[];
  locale: string;
  onDrill: (title: string) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0)
    return <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>;
  return (
    <ul className="mt-4 divide-y divide-slate-800">
      {rows.map((r) => (
        <li key={r.title}>
          <button
            type="button"
            onClick={() => onDrill(r.title)}
            className="flex w-full items-center gap-2 py-2 text-left text-sm"
          >
            <span className="flex-1 truncate text-slate-200">{r.title}</span>
            <span className="tabular-nums text-slate-500">{r.count}</span>
            <span className="w-24 text-right tabular-nums text-slate-200">
              {formatMoney(r.total, BASE_CURRENCY, locale)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
