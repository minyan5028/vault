import { useTranslation } from "react-i18next";

/** Dev-time language switch (EN / 中). Shared across screens. */
export function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.resolvedLanguage === "zh-TW" ? "en" : "zh-TW";
  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(next)}
      className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300"
    >
      {i18n.resolvedLanguage === "zh-TW" ? "中" : "EN"}
    </button>
  );
}
