import { useTranslation } from "react-i18next";
import { monthLabel } from "../lib/date";

/** ‹ 2026年7月 › month stepper. `onShift(±1)` moves by whole months. */
export function MonthSelector({
  month,
  onShift,
}: {
  month: string;
  onShift: (delta: number) => void;
}) {
  const { i18n } = useTranslation();
  return (
    <div className="flex items-center justify-between py-1 text-slate-300">
      <button
        type="button"
        onClick={() => onShift(-1)}
        aria-label="previous month"
        className="px-3 py-1 text-xl text-slate-400"
      >
        ‹
      </button>
      <span className="text-base font-medium">{monthLabel(month, i18n.language)}</span>
      <button
        type="button"
        onClick={() => onShift(1)}
        aria-label="next month"
        className="px-3 py-1 text-xl text-slate-400"
      >
        ›
      </button>
    </div>
  );
}
