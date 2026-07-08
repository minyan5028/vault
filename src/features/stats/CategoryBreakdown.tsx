import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { UNCATEGORIZED, type Category } from "../../domain/types";
import { CategoryDonut } from "./CategoryDonut";
import { SLICE_COLORS, OTHER_COLOR, type Slice } from "./donutPalette";

const BASE_CURRENCY = "TWD";

/** Expense/income-by-category: a donut over the top categories plus a
 *  color-linked list. Tapping a row drills into that category's transactions. */
export function CategoryBreakdown({
  rows,
  donut,
  total,
  categories,
  locale,
  onDrill,
}: {
  rows: { id: string; amount: number }[];
  donut: Slice[];
  total: number;
  categories: Category[];
  locale: string;
  onDrill: (key: string, label: string) => void;
}) {
  const { t } = useTranslation();
  if (total === 0)
    return <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>;
  return (
    <>
      <div className="mt-4">
        <CategoryDonut slices={donut} total={total} locale={locale} />
      </div>
      <ul className="mt-4 space-y-3">
        {rows.map((r, i) => {
          const cat = r.id === UNCATEGORIZED ? undefined : categories.find((c) => c.id === r.id);
          const pct = Math.round((r.amount / total) * 100);
          const color = i < SLICE_COLORS.length ? SLICE_COLORS[i] : OTHER_COLOR;
          const label = cat?.name ?? t("uncategorized");
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onDrill(r.id, label)}
                className="w-full text-left"
              >
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-base">{cat?.icon ?? "•"}</span>
                  <span className="flex-1 truncate text-slate-200">{label}</span>
                  <span className="tabular-nums text-slate-400">{pct}%</span>
                  <span className="w-24 text-right tabular-nums text-slate-200">
                    {formatMoney(r.amount, BASE_CURRENCY, locale)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
