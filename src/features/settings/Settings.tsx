import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account, Category } from "../../domain/types";
import { signOutUser } from "../../auth/useAuth";
import { Manage } from "../manage/Manage";
import { Recurring } from "../recurring/Recurring";
import { Backup } from "../backup/Backup";

type Sub = "catalog" | "recurring" | "backup" | null;

/**
 * Settings hub — the home for configuration (accounts/categories today;
 * recurring, backup, currency later). Keeps the Timeline header uncluttered.
 */
export function Settings({
  ledgerId,
  accounts,
  categories,
  onClose,
}: {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [sub, setSub] = useState<Sub>(null);

  if (sub === "catalog") {
    return (
      <Manage
        ledgerId={ledgerId}
        accounts={accounts}
        categories={categories}
        onClose={() => setSub(null)}
      />
    );
  }
  if (sub === "recurring") {
    return (
      <Recurring
        ledgerId={ledgerId}
        accounts={accounts}
        categories={categories}
        onClose={() => setSub(null)}
      />
    );
  }
  if (sub === "backup") {
    return <Backup ledgerId={ledgerId} onClose={() => setSub(null)} />;
  }

  const nextLang = i18n.resolvedLanguage === "zh-TW" ? "en" : "zh-TW";

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
          <span className="text-sm font-semibold text-slate-300">{t("settings")}</span>
          <span className="w-8" />
        </header>

        <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl bg-slate-800/40">
          <Row label={t("catalog")} onClick={() => setSub("catalog")} chevron />
          <Row label={t("recurring")} onClick={() => setSub("recurring")} chevron />
          <Row label={t("backup")} onClick={() => setSub("backup")} chevron />
          <Row
            label={t("language")}
            value={i18n.resolvedLanguage === "zh-TW" ? "中文" : "English"}
            onClick={() => void i18n.changeLanguage(nextLang)}
          />
          <Row label={t("signOut")} onClick={() => void signOutUser()} danger />
        </ul>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
  chevron,
  danger,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "flex w-full items-center justify-between px-4 py-3 text-left text-sm active:bg-slate-800 " +
          (danger ? "text-rose-400" : "text-slate-200")
        }
      >
        <span>{label}</span>
        <span className="flex items-center gap-2 text-slate-500">
          {value}
          {chevron && <span>›</span>}
        </span>
      </button>
    </li>
  );
}
