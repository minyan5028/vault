import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import type { LedgerEndpoint } from "../../lib/endpoints";
import type { Category, Project, Transaction } from "../../domain/types";
import { EntryRow } from "../../components/EntryRow";

const BASE_CURRENCY = "TWD";

/** The transactions behind a tapped category or title, for the selected period.
 *  Reuses the Timeline's row (tap to edit, swipe to delete). */
export function DrillView({
  label,
  txns,
  endpoints,
  categories,
  projects,
  locale,
  onBack,
  onEdit,
  onDelete,
}: {
  label: string;
  txns: Transaction[];
  endpoints: ReadonlyMap<string, LedgerEndpoint>;
  categories: Category[];
  projects: Project[];
  locale: string;
  onBack: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { t } = useTranslation();
  const total = txns.reduce((s, tx) => s + tx.baseAmount, 0);
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex items-center gap-1 py-2 text-sm text-slate-400"
      >
        <span className="text-lg leading-none">‹</span>
        {t("stats")}
      </button>
      <div className="flex items-baseline justify-between border-b border-slate-800 pb-2">
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{label}</span>
        <span className="ml-3 shrink-0 tabular-nums text-slate-300">
          {formatMoney(total, BASE_CURRENCY, locale)}
        </span>
      </div>
      {txns.length === 0 ? (
        <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-800">
          {txns.map((tx) => (
            <EntryRow
              key={tx.id}
              tx={tx}
              locale={locale}
              endpoints={endpoints}
              categories={categories}
              projects={projects}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
