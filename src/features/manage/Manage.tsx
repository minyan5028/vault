import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Account, Category } from "../../domain/types";
import { accountRepo, categoryRepo } from "../../data/catalogRepo";

/** Manage the catalog: add / rename / archive accounts and categories. */
export function Manage({
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
  const { t } = useTranslation();

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
          <span className="text-sm font-semibold text-slate-300">{t("manage")}</span>
          <span className="w-8" />
        </header>

        {/* Accounts */}
        <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("accounts")}</h2>
        <ul className="mb-3 space-y-2">
          {accounts.map((a) => (
            <AccountRow key={a.id} ledgerId={ledgerId} account={a} />
          ))}
        </ul>
        <AddRow
          onAdd={(name) => accountRepo.add(ledgerId, { name, sortOrder: accounts.length })}
        />

        {/* Expense categories */}
        <h2 className="mb-2 mt-8 text-xs uppercase tracking-wide text-slate-500">
          {t("expenseCategories")}
        </h2>
        <ul className="mb-3 space-y-2">
          {categories
            .filter((c) => c.type === "expense")
            .map((c) => (
              <CategoryRow key={c.id} ledgerId={ledgerId} category={c} />
            ))}
        </ul>
        <AddRow
          withIcon
          onAdd={(name, icon) =>
            categoryRepo.add(ledgerId, {
              name,
              icon: icon || null,
              type: "expense",
              sortOrder: categories.filter((c) => c.type === "expense").length,
            })
          }
        />

        {/* Income categories */}
        <h2 className="mb-2 mt-8 text-xs uppercase tracking-wide text-slate-500">
          {t("incomeCategories")}
        </h2>
        <ul className="mb-3 space-y-2">
          {categories
            .filter((c) => c.type === "income")
            .map((c) => (
              <CategoryRow key={c.id} ledgerId={ledgerId} category={c} />
            ))}
        </ul>
        <AddRow
          withIcon
          onAdd={(name, icon) =>
            categoryRepo.add(ledgerId, {
              name,
              icon: icon || null,
              type: "income",
              sortOrder: categories.filter((c) => c.type === "income").length,
            })
          }
        />
      </div>
    </div>
  );
}

function AccountRow({ ledgerId, account }: { ledgerId: string; account: Account }) {
  const { t } = useTranslation();
  const [name, setName] = useState(account.name);
  const dim = account.archived ? "opacity-40" : "";

  return (
    <li className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== account.name) accountRepo.update(ledgerId, account.id, { name: v });
        }}
        className={"flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none " + dim}
      />
      <ArchiveButton
        archived={account.archived}
        label={t(account.archived ? "unarchive" : "archive")}
        onClick={() => accountRepo.update(ledgerId, account.id, { archived: !account.archived })}
      />
    </li>
  );
}

function CategoryRow({ ledgerId, category }: { ledgerId: string; category: Category }) {
  const { t } = useTranslation();
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "");
  const dim = category.archived ? "opacity-40" : "";

  return (
    <li className="flex items-center gap-2">
      <input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        onBlur={() => {
          if (icon !== (category.icon ?? ""))
            categoryRepo.update(ledgerId, category.id, { icon: icon || null });
        }}
        aria-label={t("iconPlaceholder")}
        className={"w-11 rounded-lg bg-slate-800 py-2 text-center text-base outline-none " + dim}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== category.name) categoryRepo.update(ledgerId, category.id, { name: v });
        }}
        className={"flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none " + dim}
      />
      <ArchiveButton
        archived={category.archived}
        label={t(category.archived ? "unarchive" : "archive")}
        onClick={() => categoryRepo.update(ledgerId, category.id, { archived: !category.archived })}
      />
    </li>
  );
}

function ArchiveButton({
  archived,
  label,
  onClick,
}: {
  archived: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 rounded-lg px-2 py-2 text-xs " +
        (archived ? "text-sky-400" : "text-slate-500 hover:text-rose-400")
      }
    >
      {label}
    </button>
  );
}

function AddRow({
  withIcon,
  onAdd,
}: {
  withIcon?: boolean;
  onAdd: (name: string, icon: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  function add() {
    const v = name.trim();
    if (!v) return;
    onAdd(v, icon.trim());
    setName("");
    setIcon("");
  }

  return (
    <div className="flex items-center gap-2">
      {withIcon && (
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🏷️"
          aria-label={t("iconPlaceholder")}
          className="w-11 rounded-lg bg-slate-800 py-2 text-center text-base outline-none placeholder:text-slate-600"
        />
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={t("namePlaceholder")}
        className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={add}
        disabled={!name.trim()}
        className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-30"
      >
        {t("add")}
      </button>
    </div>
  );
}
