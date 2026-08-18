import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import type { ProjectTotal } from "../../lib/rollup";
import type { Project } from "../../domain/types";

/**
 * Each Project's figures for the period, dearest first. Read straight out of
 * the rollups the screen has already loaded — no transaction reads.
 *
 * The net is what the episode cost: expenses minus the income it brought back.
 * Where those differ, both are shown, because "the wedding cost 150,000" is
 * only trustworthy next to the 350,000 that went out.
 */
export function ProjectList({
  totals,
  projects,
  locale,
  onOpen,
}: {
  totals: ProjectTotal[];
  projects: Project[];
  locale: string;
  onOpen: (projectId: string, label: string) => void;
}) {
  const { t } = useTranslation();
  if (totals.length === 0) {
    return <p className="mt-16 text-center text-sm text-slate-600">{t("noProjectSpend")}</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-slate-800">
      {totals.map((row) => {
        // A soft-deleted Project keeps its rollup key; the events under it were
        // never rewritten, so the figure is real even though the name is gone.
        const project = projects.find((p) => p.id === row.projectId);
        const label = project?.name ?? t("deletedProject");
        return (
          <li key={row.projectId}>
            <button
              type="button"
              onClick={() => onOpen(row.projectId, label)}
              className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-800/50"
            >
              <div className="min-w-0 flex-1">
                <p className={"truncate text-sm " + (project ? "text-slate-200" : "text-slate-500 italic")}>
                  {label}
                </p>
                {row.income > 0 && (
                  <p className="text-xs text-slate-500">
                    {formatMoney(row.expense, "TWD", locale)} − {formatMoney(row.income, "TWD", locale)}
                  </p>
                )}
              </div>
              <span className="text-sm tabular-nums text-slate-200">
                {formatMoney(row.net, "TWD", locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
