import { useTranslation } from "react-i18next";
import { signIn } from "../../auth/useAuth";
import { LanguageToggle } from "../../components/LanguageToggle";

export function SignIn() {
  const { t } = useTranslation();
  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{t("appName")}</h1>
          <p className="mt-2 text-slate-400">{t("tagline")}</p>
        </div>
        <button
          type="button"
          onClick={() => void signIn()}
          className="rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-900 active:bg-white"
        >
          {t("signIn")}
        </button>
      </div>
    </main>
  );
}
