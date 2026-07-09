import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toMinor, toMajor, CURRENCIES } from "../../lib/money";
import type { Account, Category } from "../../domain/types";
import { accountRepo, categoryRepo } from "../../data/catalogRepo";
import { holdingRepo } from "../../data/holdingRepo";
import { useHoldings } from "../../data/useHoldings";

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
  const { fx, holdings } = useHoldings(ledgerId);
  // Every non-base currency in use (accounts + holdings) needs a rate into TWD.
  const foreignCurrencies = [
    ...new Set([...accounts.map((a) => a.currency), ...holdings.map((h) => h.currency)]),
  ]
    .filter((c) => c !== "TWD")
    .sort();

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
          withCurrency
          onAdd={(name, _icon, currency) =>
            accountRepo.add(ledgerId, { name, currency, sortOrder: accounts.length })
          }
        />

        {/* Exchange rates — one per foreign currency in use (into TWD). */}
        {foreignCurrencies.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 text-xs uppercase tracking-wide text-slate-500">
              {t("exchangeRates")}
            </h2>
            <ul className="space-y-2">
              {foreignCurrencies.map((cur) => (
                <FxRow key={cur} ledgerId={ledgerId} currency={cur} rate={fx[cur]} />
              ))}
            </ul>
          </>
        )}

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
  const [opening, setOpening] = useState(String(toMajor(account.openingBalance)));
  const dim = account.archived ? "opacity-40" : "";

  function commitOpening() {
    let minor: number;
    try {
      minor = toMinor(opening.trim() || "0");
    } catch {
      return;
    }
    if (minor !== account.openingBalance)
      accountRepo.update(ledgerId, account.id, { openingBalance: minor });
  }

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
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
      </div>
      <div className="flex items-center gap-2 pl-1 text-xs text-slate-500">
        <label>{t("openingBalance")}</label>
        <input
          inputMode="decimal"
          value={opening}
          onChange={(e) => setOpening(e.target.value.replace(/[^0-9.-]/g, ""))}
          onBlur={commitOpening}
          className="w-32 rounded bg-slate-800 px-2 py-1 text-right text-slate-300 outline-none [color-scheme:dark]"
        />
        {/* Currency is set at creation and rarely changes — shown read-only here
            to avoid accidental edits. */}
        <span className="px-1 text-slate-500">{account.currency}</span>
      </div>
    </li>
  );
}

function FxRow({
  ledgerId,
  currency,
  rate,
}: {
  ledgerId: string;
  currency: string;
  rate?: number;
}) {
  const [val, setVal] = useState(rate != null ? String(rate) : "");

  function commit() {
    const r = parseFloat(val);
    if (Number.isFinite(r) && r > 0 && r !== rate) holdingRepo.setFxRate(ledgerId, currency, r);
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="flex-1 text-slate-300">1 {currency} =</span>
      <input
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={commit}
        placeholder="0"
        className="w-24 rounded bg-slate-800 px-2 py-1 text-right text-slate-200 outline-none [color-scheme:dark]"
      />
      <span className="w-10 text-slate-500">TWD</span>
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
  withCurrency,
  onAdd,
}: {
  withIcon?: boolean;
  withCurrency?: boolean;
  onAdd: (name: string, icon: string, currency: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [currency, setCurrency] = useState("TWD");

  function add() {
    const v = name.trim();
    if (!v) return;
    onAdd(v, icon.trim(), currency);
    setName("");
    setIcon("");
    setCurrency("TWD");
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
      {withCurrency && (
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-lg bg-slate-800 px-2 py-2 text-sm text-slate-300 outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
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
