import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { projectState } from "../../lib/project";
import { projectRepo } from "../../data/projectRepo";
import type { Project } from "../../domain/types";

const field = "w-full rounded-lg bg-slate-800 px-3 py-2.5 text-base outline-none [color-scheme:dark]";

/**
 * Manage Projects — bounded, non-daily episodes of spending (ADR-0009).
 *
 * A Settings screen rather than part of the recording path: declaring a Project
 * is the uncommon path and may cost ten seconds, so that recording during one
 * costs nothing extra.
 */
export function Projects({ ledgerId, onClose }: { ledgerId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  // Hold the *id*, not the Project. `projects` is live from onSnapshot, so a
  // captured object goes stale the moment a write lands — and a controlled
  // checkbox bound to a stale value snaps back to it, making auto-assign
  // impossible to turn off.
  const [editing, setEditing] = useState<null | { id: string | null }>(null);

  useEffect(() => projectRepo.subscribe(ledgerId, setProjects), [ledgerId]);

  // "In progress" and "ended" are read off today, never stored.
  const today = useMemo(() => new Date(), []);
  const groups = useMemo(() => {
    const active = projects.filter((p) => projectState(p, today) === "active");
    const ended = projects.filter((p) => projectState(p, today) === "ended");
    return [
      { key: "projectActive" as const, items: active },
      { key: "projectEnded" as const, items: ended },
    ];
  }, [projects, today]);

  if (editing) {
    const project = editing.id === null ? undefined : projects.find((p) => p.id === editing.id);
    // The Project can vanish under us (deleted here, or by the other member of
    // a shared Ledger); fall back to the list rather than an empty form.
    if (editing.id !== null && !project) {
      setEditing(null);
      return null;
    }
    return (
      <ProjectForm
        ledgerId={ledgerId}
        projects={projects}
        project={project}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-10 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">{t("projects")}</span>
          <button
            type="button"
            onClick={() => setEditing({ id: null })}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900"
          >
            {t("add")}
          </button>
        </header>

        {projects.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("noProjects")}</p>
        ) : (
          groups.map(({ key, items }) =>
            items.length === 0 ? null : (
              <section key={key} className="mt-4 first:mt-0">
                <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t(key)}</h2>
                <ul className="divide-y divide-slate-800">
                  {items.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: p.id })}
                        className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-800/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-200">{p.name}</p>
                          <p className="text-xs text-slate-500">
                            {dateRange(p, i18n.language)}
                          </p>
                        </div>
                        {p.autoAssign && key === "projectActive" && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            {t("autoAssign")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )
        )}
      </div>
    </div>
  );
}

function dateRange(p: Project, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  return `${fmt.format(p.startDate)} – ${fmt.format(p.endDate)}`;
}

function ProjectForm({
  ledgerId,
  projects,
  project,
  onClose,
}: {
  ledgerId: string;
  projects: Project[];
  project?: Project;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(project?.name ?? "");
  const [startText, setStartText] = useState(toDateInputValue(project?.startDate ?? new Date()));
  // Empty on a new project, deliberately: an end date is mandatory and must be
  // a choice the owner makes, not a default they can save past without noticing.
  const [endText, setEndText] = useState(project ? toDateInputValue(project.endDate) : "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ended = project ? projectState(project, new Date()) === "ended" : false;
  const outOfOrder = endText !== "" && endText < startText;
  const canSave = name.trim() !== "" && startText !== "" && endText !== "" && !outOfOrder;

  function save() {
    if (!canSave) return;
    const input = {
      name,
      startDate: fromDateInputValue(startText),
      endDate: fromDateInputValue(endText),
    };
    if (project) void projectRepo.update(ledgerId, project.id, input);
    else void projectRepo.add(ledgerId, input);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md space-y-3 px-4 pb-10 pt-4">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">
            {project ? t("projects") : t("newProject")}
          </span>
          <span className="w-8" />
        </header>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className={field}
        />

        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-xs text-slate-500">{t("startDate")}</label>
          <input
            type="date"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            className={"flex-1 " + field}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-xs text-slate-500">{t("endDate")}</label>
          <input
            type="date"
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            className={"flex-1 " + field}
          />
        </div>
        {endText === "" ? (
          <p className="text-xs text-slate-500">{t("endDateRequired")}</p>
        ) : outOfOrder ? (
          <p className="text-xs text-rose-400">{t("endDateBeforeStart")}</p>
        ) : null}

        {/* Auto-assign. Offered only on a saved, unfinished Project: an ended
            Project stamps nothing, so the switch would be a lie. */}
        {project && !ended && (
          <div className="rounded-lg bg-slate-800/50 p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-200">{t("autoAssign")}</span>
              <input
                type="checkbox"
                checked={project.autoAssign}
                onChange={(e) =>
                  void projectRepo.setAutoAssign(ledgerId, projects, project.id, e.target.checked)
                }
                className="h-5 w-5 accent-emerald-500"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">{t("autoAssignHint")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={
            "h-12 w-full rounded-xl text-base font-semibold " +
            (canSave
              ? "bg-emerald-500 text-slate-900 active:bg-emerald-400"
              : "cursor-not-allowed bg-slate-800 text-slate-600")
          }
        >
          {t("save")}
        </button>

        {project &&
          (confirmingDelete ? (
            <div className="space-y-2 rounded-lg bg-slate-800/50 p-3">
              <p className="text-xs text-slate-400">{t("deleteProjectConfirm")}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="h-10 flex-1 rounded-xl bg-slate-800 text-sm text-slate-300"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void projectRepo.remove(ledgerId, project.id);
                    onClose();
                  }}
                  className="h-10 flex-1 rounded-xl bg-rose-500/15 text-sm font-medium text-rose-400"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="h-10 w-full rounded-xl text-sm font-medium text-rose-400 active:bg-slate-800"
            >
              {t("delete")}
            </button>
          ))}
      </div>
    </div>
  );
}
