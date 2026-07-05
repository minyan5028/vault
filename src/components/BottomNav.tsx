import { useTranslation } from "react-i18next";

export type Tab = "timeline" | "stats" | "assets" | "settings";

const TABS: { id: Tab; icon: string; label: "bills" | "stats" | "assets" | "settings" }[] = [
  { id: "timeline", icon: "📒", label: "bills" },
  { id: "stats", icon: "📊", label: "stats" },
  { id: "assets", icon: "🪙", label: "assets" },
  { id: "settings", icon: "⚙️", label: "settings" },
];

/** Fixed bottom tab bar for the primary destinations (mobile-first). */
export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] " +
              (active === tab.id ? "text-rose-400" : "text-slate-500")
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {t(tab.label)}
          </button>
        ))}
      </div>
    </nav>
  );
}
