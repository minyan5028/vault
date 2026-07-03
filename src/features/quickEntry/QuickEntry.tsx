import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { SEED_ACCOUNTS, SEED_CATEGORIES } from "../../data/fixtures";
import type { EventType } from "../../domain/types";
import type { EntryDraft } from "../../data/transactionRepo";
import { appendDigit, backspace } from "./amountInput";
import { Numpad } from "./Numpad";
import { LanguageToggle } from "../../components/LanguageToggle";

const TYPES: EventType[] = ["expense", "income", "transfer"];

interface QuickEntryProps {
  onSubmit: (draft: EntryDraft) => void;
  onClose: () => void;
}

/**
 * Quick Entry overlay — opened from the Timeline's FAB (see docs/UX.md).
 * Field order follows the user's habit: amount → title → category → account,
 * with date (defaults to today) and note as unobtrusive defaults.
 */
export function QuickEntry({ onSubmit, onClose }: QuickEntryProps) {
  const { t, i18n } = useTranslation();

  const [type, setType] = useState<EventType>("expense");
  const [minor, setMinor] = useState(0);
  const [accountId, setAccountId] = useState(SEED_ACCOUNTS[0].id);
  const [toAccountId, setToAccountId] = useState(SEED_ACCOUNTS[4].id);
  const [categoryId, setCategoryId] = useState(SEED_CATEGORIES[0].id); // most frequent
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(() => new Date());
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const account = SEED_ACCOUNTS.find((a) => a.id === accountId)!;
  const currency = account.currency;
  const isTransfer = type === "transfer";

  const canSave = useMemo(() => {
    if (minor <= 0) return false;
    if (isTransfer) return accountId !== toAccountId;
    return categoryId !== null;
  }, [minor, isTransfer, accountId, toAccountId, categoryId]);

  function save() {
    if (!canSave || saved) return;
    onSubmit({
      type,
      amount: minor,
      currency,
      baseAmount: minor, // single-currency for now; FX locks here later
      baseCurrency: currency,
      fxRate: 1,
      date,
      categoryId: isTransfer ? null : categoryId,
      accountId,
      toAccountId: isTransfer ? toAccountId : null,
      title: title.trim(),
      note: showNote ? note.trim() || null : null,
    });
    // Brief ✓ confirmation, then return to the Timeline.
    setSaved(true);
    setTimeout(onClose, 550);
  }

  // Physical keyboard: digits type the amount, Backspace deletes, Enter saves,
  // Escape closes. Ignored while a text field (title/note) is focused.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key >= "0" && e.key <= "9") {
        setMinor((m) => appendDigit(m, Number(e.key)));
        e.preventDefault();
      } else if (e.key === "Backspace") {
        setMinor((m) => backspace(m));
        e.preventDefault();
      } else if (e.key === "Enter") {
        saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      {saved && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/70">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-4xl text-slate-900">
            ✓
          </div>
        </div>
      )}
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6 pt-4">
        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">{t("newEntry")}</span>
          <LanguageToggle />
        </header>

        {/* Type toggle */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800 p-1 text-sm">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setType(ty)}
              className={
                "rounded-lg py-2 font-medium transition-colors " +
                (type === ty ? "bg-slate-100 text-slate-900" : "text-slate-300")
              }
            >
              {t(`type_${ty}` as "type_expense")}
            </button>
          ))}
        </div>

        {/* Amount + title (the primary descriptor, right after the amount) */}
        <div className="py-6 text-center">
          <div
            className={
              "text-5xl font-semibold tabular-nums " +
              (minor > 0 ? "text-slate-50" : "text-slate-600")
            }
          >
            {formatMoney(minor, currency, i18n.language)}
          </div>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className="mt-4 w-full rounded-xl bg-slate-800 px-3 py-2 text-center text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
          />
        </div>

        {/* Category grid (hidden for transfers) or transfer destination */}
        {isTransfer ? (
          <TransferAccounts
            fromId={accountId}
            toId={toAccountId}
            onTo={setToAccountId}
            toLabel={t("to")}
          />
        ) : (
          <section>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              {t("category")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {SEED_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={
                    "flex flex-col items-center gap-1 rounded-xl py-2 text-xs " +
                    (categoryId === c.id
                      ? "bg-slate-700 ring-2 ring-slate-300"
                      : "bg-slate-800 text-slate-300")
                  }
                >
                  <span className="text-xl">{c.icon}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Account (source) selector — chips */}
        <section className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            {isTransfer ? t("from") : t("account")}
          </p>
          <div className="flex flex-wrap gap-2">
            {SEED_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={
                  "rounded-full px-3 py-1 text-sm " +
                  (accountId === a.id
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-800 text-slate-300")
                }
              >
                {a.name}
              </button>
            ))}
          </div>
        </section>

        {/* Date (defaults to today) + optional note */}
        <section className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500">{t("date")}</label>
            <input
              type="date"
              value={toDateInputValue(date)}
              onChange={(e) => setDate(fromDateInputValue(e.target.value))}
              className="rounded-lg bg-slate-800 px-2 py-1 text-slate-200 outline-none [color-scheme:dark]"
            />
          </div>
          {showNote ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("note")}
              rows={2}
              className="w-full rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              + {t("addNote")}
            </button>
          )}
        </section>

        {/* Numpad + Save */}
        <section className="mt-5">
          <Numpad
            onDigit={(d) => setMinor((m) => appendDigit(m, d))}
            onBackspace={() => setMinor((m) => backspace(m))}
            onNext={() => titleRef.current?.focus()}
          />
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={
              "mt-3 h-14 w-full rounded-xl text-lg font-semibold transition-colors " +
              (canSave
                ? "bg-emerald-500 text-slate-900 active:bg-emerald-400"
                : "cursor-not-allowed bg-slate-800 text-slate-600")
            }
          >
            {t("save")}
          </button>
        </section>
      </div>
    </div>
  );
}

function TransferAccounts({
  fromId,
  toId,
  onTo,
  toLabel,
}: {
  fromId: string;
  toId: string;
  onTo: (id: string) => void;
  toLabel: string;
}) {
  return (
    <section>
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{toLabel}</p>
      <div className="flex flex-wrap gap-2">
        {SEED_ACCOUNTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onTo(a.id)}
            disabled={a.id === fromId}
            className={
              "rounded-full px-3 py-1 text-sm disabled:opacity-30 " +
              (toId === a.id ? "bg-slate-100 text-slate-900" : "bg-slate-800 text-slate-300")
            }
          >
            {a.name}
          </button>
        ))}
      </div>
    </section>
  );
}
