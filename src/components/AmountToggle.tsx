import { useTranslation } from "react-i18next";

/** Fixed eye button (top-right) to hide/show all amounts for demos. */
export function AmountToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={hidden ? t("showAmounts") : t("hideAmounts")}
      title={hidden ? t("showAmounts") : t("hideAmounts")}
      className="fixed right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 shadow backdrop-blur active:bg-slate-700"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  );
}
