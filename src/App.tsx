import { useTranslation } from "react-i18next";
import { formatMoney } from "./lib/money";
import { supportedLngs } from "./i18n";

/**
 * Placeholder shell. The Quick Entry screen (the 3-second common path, see
 * docs/UX.md) is the next thing to build — deliberately left for a design pass.
 *
 * NOTE: all user-facing text goes through `t(...)`; nothing is hardcoded.
 */
export function App() {
  const { t, i18n } = useTranslation();
  const example = formatMoney(14990, "TWD", i18n.language);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("appName")}</h1>
        <p className="mt-2 text-slate-400">{t("tagline")}</p>
        <p className="mt-6 text-sm text-slate-500">{t("scaffoldNote", { example })}</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">{t("language")}:</span>
        {supportedLngs.map((lng) => (
          <button
            key={lng}
            onClick={() => void i18n.changeLanguage(lng)}
            className={
              "rounded px-2 py-1 " +
              (i18n.resolvedLanguage === lng
                ? "bg-slate-100 text-slate-900"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700")
            }
          >
            {lng}
          </button>
        ))}
      </div>
    </main>
  );
}
