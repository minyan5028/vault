import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { SEED_ACCOUNTS, SEED_CATEGORIES } from "../../data/fixtures";
import type { SessionEntry } from "../entries";
import { LanguageToggle } from "../../components/LanguageToggle";

/** The home screen: a day-grouped list of Financial Events (see docs/UX.md). */
export function Timeline({ entries }: { entries: SessionEntry[] }) {
  const { t, i18n } = useTranslation();
  const groups = groupByDay(entries);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <header className="mb-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">{t("appName")}</span>
          <LanguageToggle />
        </header>

        {entries.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  {formatDay(day, i18n.language)}
                </h2>
                <ul className="divide-y divide-slate-800">
                  {items.map((e) => (
                    <EntryRow key={e.id} entry={e} locale={i18n.language} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EntryRow({ entry, locale }: { entry: SessionEntry; locale: string }) {
  const category = SEED_CATEGORIES.find((c) => c.id === entry.categoryId);
  const account = SEED_ACCOUNTS.find((a) => a.id === entry.accountId);
  const toAccount = SEED_ACCOUNTS.find((a) => a.id === entry.toAccountId);
  const label =
    entry.title ||
    (entry.type === "transfer"
      ? `${account?.name} → ${toAccount?.name}`
      : category?.name) ||
    "";
  const sign = entry.type === "income" ? "+" : entry.type === "expense" ? "−" : "";
  const amountColor =
    entry.type === "income"
      ? "text-emerald-400"
      : entry.type === "expense"
        ? "text-slate-100"
        : "text-slate-400";

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="text-xl">{entry.type === "transfer" ? "↔️" : category?.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200">{label}</p>
        <p className="text-xs text-slate-500">{account?.name}</p>
      </div>
      <span className={"text-sm tabular-nums " + amountColor}>
        {sign}
        {formatMoney(entry.amount, entry.currency, locale)}
      </span>
    </li>
  );
}

/** Group entries by local day, preserving newest-first order. */
function groupByDay(entries: SessionEntry[]): [string, SessionEntry[]][] {
  const map = new Map<string, SessionEntry[]>();
  for (const e of entries) {
    const key = toDateInputValue(e.date);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()];
}

function formatDay(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(fromDateInputValue(key));
}
