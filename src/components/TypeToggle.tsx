import { useTranslation } from "react-i18next";
import type { EventType } from "../domain/types";

const TYPES: EventType[] = ["expense", "income", "transfer"];

/** Expense / Income / Transfer segmented toggle. */
export function TypeToggle({
  value,
  onChange,
}: {
  value: EventType;
  onChange: (type: EventType) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800 p-1 text-sm">
      {TYPES.map((ty) => (
        <button
          key={ty}
          type="button"
          onClick={() => onChange(ty)}
          className={
            "rounded-lg py-2 font-medium transition-colors " +
            (value === ty ? "bg-slate-100 text-slate-900" : "text-slate-300")
          }
        >
          {t(`type_${ty}` as "type_expense")}
        </button>
      ))}
    </div>
  );
}
