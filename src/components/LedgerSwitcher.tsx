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
  const active = ledgers.find((l) => l.id === activeId);

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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl bg-slate-800 shadow-lg ring-1 ring-slate-700">
            {ledgers.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onSelect(l.id);
                  setOpen(false);
                }}
                className={
                  "block w-full px-3 py-2 text-left text-sm " +
                  (l.id === activeId ? "bg-slate-700 text-slate-100" : "text-slate-300")
                }
              >
                {l.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const name = window.prompt(t("newLedger"));
                setOpen(false);
                if (name && name.trim()) onCreate(name.trim());
              }}
              className="block w-full border-t border-slate-700 px-3 py-2 text-left text-sm text-emerald-400"
            >
              + {t("newLedger")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
