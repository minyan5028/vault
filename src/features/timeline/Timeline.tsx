import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import {
  toDateInputValue,
  fromDateInputValue,
  yearMonthOf,
  shiftMonth,
  monthLabel,
} from "../../lib/date";
import { useMonthTransactions } from "../../data/useMonthTransactions";
import type { Account, Category, Transaction } from "../../domain/types";
import { LanguageToggle } from "../../components/LanguageToggle";
import { signOutUser } from "../../auth/useAuth";

const BASE_CURRENCY = "TWD";

/**
 * The home screen: a month of Financial Events (live from Firestore) grouped by
 * day, with an income/expense/total summary and per-day subtotals (docs/UX.md).
 */
export function Timeline({
  ledgerId,
  accounts,
  categories,
  onEdit,
  onDelete,
  onManage,
  onStats,
}: {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onManage: () => void;
  onStats: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [month, setMonth] = useState<string>(() => yearMonthOf(new Date()));
  const txns = useMonthTransactions(ledgerId, month);

  const summary = useMemo(() => totals(txns), [txns]);
  const groups = useMemo(() => groupByDay(txns), [txns]);

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28">
        {/* Header */}
        <header className="flex items-center justify-between py-3">
          <span className="text-lg font-semibold tracking-tight">{t("appName")}</span>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={onStats}
              className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400"
            >
              {t("stats")}
            </button>
            <button
              type="button"
              onClick={onManage}
              className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400"
            >
              {t("manage")}
            </button>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400"
            >
              {t("signOut")}
            </button>
          </div>
        </header>

        {/* Month selector */}
        <div className="flex items-center justify-between py-1 text-slate-300">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="previous month"
            className="px-3 py-1 text-xl text-slate-400"
          >
            ‹
          </button>
          <span className="text-base font-medium">{monthLabel(month, locale)}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="next month"
            className="px-3 py-1 text-xl text-slate-400"
          >
            ›
          </button>
        </div>

        {/* Income / Expense / Total summary */}
        <div className="mt-1 grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
          <SummaryCell label={t("income")} minor={summary.income} tone="income" locale={locale} />
          <SummaryCell label={t("expense")} minor={summary.expense} tone="expense" locale={locale} />
          <SummaryCell label={t("total")} minor={summary.net} tone="total" locale={locale} />
        </div>

        {/* Day-grouped list */}
        {txns.length === 0 ? (
          <div className="mt-20 text-center text-slate-600">
            <div className="text-4xl">💰</div>
            <p className="mt-3 text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, items]) => {
              const net = totals(items).net;
              return (
                <section key={day}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <h2 className="uppercase tracking-wide text-slate-400">
                      {dayLabel(day, locale, t)}
                    </h2>
                    <span className="tabular-nums text-slate-500">
                      {formatMoney(net, BASE_CURRENCY, locale)}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-800">
                    {items.map((e) => (
                      <EntryRow
                        key={e.id}
                        tx={e}
                        locale={locale}
                        accounts={accounts}
                        categories={categories}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCell({
  label,
  minor,
  tone,
  locale,
}: {
  label: string;
  minor: number;
  tone: "income" | "expense" | "total";
  locale: string;
}) {
  const color =
    tone === "income"
      ? "text-sky-400"
      : tone === "expense"
        ? "text-rose-400"
        : "text-slate-100";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold tabular-nums " + color}>
        {formatMoney(minor, BASE_CURRENCY, locale)}
      </p>
    </div>
  );
}

const SWIPE_DELETE_THRESHOLD = 80;

function EntryRow({
  tx,
  locale,
  accounts,
  categories,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  locale: string;
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const { t } = useTranslation();
  const category = categories.find((c) => c.id === tx.categoryId);
  const account = accounts.find((a) => a.id === tx.accountId);
  const toAccount = accounts.find((a) => a.id === tx.toAccountId);
  const label =
    tx.title ||
    (tx.type === "transfer" ? `${account?.name} → ${toAccount?.name}` : category?.name) ||
    "";
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
  const amountColor =
    tx.type === "income"
      ? "text-sky-400"
      : tx.type === "expense"
        ? "text-rose-300"
        : "text-slate-400";

  // Swipe left to delete; a small move is a tap (edit). touch-action: pan-y lets
  // the list still scroll vertically.
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const swiped = useRef(false);

  return (
    <li className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end bg-rose-600 pr-4 text-sm font-medium text-white">
        {t("delete")}
      </div>
      <button
        type="button"
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          startX.current = e.clientX;
          dragging.current = true;
          swiped.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const d = Math.max(-120, Math.min(0, e.clientX - startX.current));
          if (Math.abs(d) > 5) swiped.current = true;
          setDx(d);
        }}
        onPointerUp={() => {
          dragging.current = false;
          if (dx < -SWIPE_DELETE_THRESHOLD) onDelete(tx);
          setDx(0);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setDx(0);
        }}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          onEdit(tx);
        }}
        className="relative flex w-full items-center gap-3 bg-slate-900 py-2 text-left"
      >
        <span className="text-xl">{tx.type === "transfer" ? "↔️" : category?.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-200">{label}</p>
          <p className="text-xs text-slate-500">{account?.name}</p>
        </div>
        <span className={"text-sm tabular-nums " + amountColor}>
          {sign}
          {formatMoney(tx.amount, tx.currency, locale)}
        </span>
      </button>
    </li>
  );
}

/** Income/expense/net totals in minor units (transfers excluded from spend). */
function totals(items: Transaction[]): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const e of items) {
    if (e.type === "income") income += e.baseAmount;
    else if (e.type === "expense") expense += e.baseAmount;
  }
  return { income, expense, net: income - expense };
}

/** Group transactions by local day, preserving newest-first order. */
function groupByDay(txns: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const e of txns) {
    const key = toDateInputValue(e.date);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()];
}

function dayLabel(key: string, locale: string, t: (k: "today" | "yesterday") => string): string {
  const today = toDateInputValue(new Date());
  const yesterday = toDateInputValue(new Date(Date.now() - 86_400_000));
  if (key === today) return t("today");
  if (key === yesterday) return t("yesterday");
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(fromDateInputValue(key));
}
