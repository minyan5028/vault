import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ledger } from "../domain/types";

/** Header control showing the active ledger, with a menu to switch or create. */
export function LedgerSwitcher({
  ledgers,
  activeId,
  onSelect,
  onCreate,
}: {
  ledgers: Ledger[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const active = ledgers.find((l) => l.id === activeId);

  function close() {
    setOpen(false);
    setCreating(false);
    setName("");
  }

  function submit() {
    const n = name.trim();
    if (n) onCreate(n);
    close();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-lg font-semibold tracking-tight"
      >
        {active?.name ?? t("appName")}
        <span className="text-xs text-slate-500">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl bg-slate-800 shadow-lg ring-1 ring-slate-700">
            {ledgers.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onSelect(l.id);
                  close();
                }}
                className={
                  "block w-full px-3 py-2 text-left text-sm " +
                  (l.id === activeId ? "bg-slate-700 text-slate-100" : "text-slate-300")
                }
              >
                {l.name}
              </button>
            ))}

            {creating ? (
              <div className="flex items-center gap-2 border-t border-slate-700 p-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") close();
                  }}
                  placeholder={t("newLedger")}
                  className="w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name.trim()}
                  className="shrink-0 rounded bg-emerald-500 px-2 py-1 text-xs font-medium text-slate-900 disabled:opacity-40"
                >
                  {t("add")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="block w-full border-t border-slate-700 px-3 py-2 text-left text-sm text-emerald-400"
              >
                + {t("newLedger")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
