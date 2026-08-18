import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import type { ProjectTotal } from "../../lib/rollup";
import type { Project } from "../../domain/types";

/**
 * Each Project's figures for the period, dearest first. Read straight out of
 * the rollups the screen has already loaded — no transaction reads.
 *
 * The lead figure is the one for the **mode being viewed**, because the two
 * screens either side of this one are structurally forced to it: the split
 * above has to add up to the headline expense, and the category breakdown below
 * has to add up to its own donut. A list that led with the net would put three
 * different numbers for one Project on three consecutive screens.
 *
 * The net — what the episode actually cost, expenses minus the income it
 * brought back — is what ADR-0009 says a Project's figure *is*, so it is still
 * shown wherever it differs, labelled, on its own line. "The wedding cost
 * 150,000" stays answerable; it just is not the number that has to reconcile.
 */
export function ProjectList({
  totals,
  projects,
  mode,
  locale,
  onOpen,
}: {
  totals: ProjectTotal[];
  projects: Project[];
  mode: "expense" | "income";
  locale: string;
  onOpen: (projectId: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const rows = totals
    .map((row) => ({ ...row, lead: mode === "expense" ? row.expense : row.income }))
    .filter((row) => row.lead !== 0)
    .sort((a, b) => b.lead - a.lead);

  if (rows.length === 0) {
    return <p className="mt-16 text-center text-sm text-slate-600">{t("noProjectSpend")}</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-slate-800">
      {rows.map((row) => {
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
                <p
                  className={
                    "truncate text-sm " + (project ? "text-slate-200" : "italic text-slate-500")
                  }
                >
                  {label}
                </p>
                {row.net !== row.lead && (
                  <p className="text-xs text-slate-500">
                    {t("net")} {formatMoney(row.net, "TWD", locale)}
                  </p>
                )}
              </div>
              <span className="text-sm tabular-nums text-slate-200">
                {formatMoney(row.lead, "TWD", locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
