import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, toMinor, toMajor } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { SEED_ACCOUNTS, SEED_CATEGORIES } from "../../data/fixtures";
import type { EventType, Transaction } from "../../domain/types";
import type { EntryDraft } from "../../data/transactionRepo";
import { LanguageToggle } from "../../components/LanguageToggle";

const TYPES: EventType[] = ["expense", "income", "transfer"];

interface QuickEntryProps {
  /** When present, edit this transaction instead of creating a new one. */
  initial?: Transaction;
  onSubmit: (draft: EntryDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Sanitize typed input to a positive decimal with at most two places. */
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  const [int, dec] = v.split(".");
  if (dec !== undefined) v = int + "." + dec.slice(0, 2);
  return v;
}

function parseMinor(text: string): number {
  const s = text.trim();
  if (!s) return 0;
  try {
    const m = toMinor(s);
    return m >= 0 ? m : 0;
  } catch {
    return 0;
  }
}

/**
 * Quick Entry overlay (see docs/UX.md). Amount uses the OS numeric keyboard;
 * the keyboard's "next" jumps to the title. Field order: amount → title →
 * category → account, with date (today) and note as unobtrusive defaults.
 */
export function QuickEntry({ initial, onSubmit, onDelete, onClose }: QuickEntryProps) {
  const { t, i18n } = useTranslation();

  const [type, setType] = useState<EventType>(initial?.type ?? "expense");
  const [amountText, setAmountText] = useState(initial ? String(toMajor(initial.amount)) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? SEED_ACCOUNTS[0].id);
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? SEED_ACCOUNTS[4].id);
  const [categoryId, setCategoryId] = useState<string | null>(
    initial ? initial.categoryId : SEED_CATEGORIES[0].id,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState<Date>(() => initial?.date ?? new Date());
  const [showNote, setShowNote] = useState(!!initial?.note);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const minor = useMemo(() => parseMinor(amountText), [amountText]);
  const account = SEED_ACCOUNTS.find((a) => a.id === accountId)!;
  const currency = account.currency;
  const isTransfer = type === "transfer";

  const canSave = useMemo(() => {
    if (minor <= 0) return false;
    if (isTransfer) return accountId !== toAccountId;
    // Expenses need a category; income's category is optional.
    return type === "expense" ? categoryId !== null : true;
  }, [minor, isTransfer, type, accountId, toAccountId, categoryId]);

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
    setSaved(true); // brief ✓ before returning to the Timeline
    setTimeout(onClose, 550);
  }

  // Esc closes the overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
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
          <span className="text-sm font-semibold text-slate-300">
            {t(initial ? "edit" : "newEntry")}
          </span>
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

        {/* Amount (OS numeric keyboard) + title */}
        <div className="py-6 text-center">
          <input
            inputMode="decimal"
            enterKeyHint="next"
            autoFocus
            value={amountText}
            onChange={(e) => setAmountText(sanitizeAmount(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                titleRef.current?.focus();
              }
            }}
            placeholder="0"
            className="w-full bg-transparent text-center text-5xl font-semibold tabular-nums text-slate-50 placeholder:text-slate-600 outline-none"
          />
          <div className="mt-1 h-5 text-sm text-slate-500">
            {minor > 0 ? formatMoney(minor, currency, i18n.language) : currency}
          </div>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            enterKeyHint="done"
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

        {/* Save / Delete */}
        <section className="mt-5">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={
              "h-14 w-full rounded-xl text-lg font-semibold transition-colors " +
              (canSave
                ? "bg-emerald-500 text-slate-900 active:bg-emerald-400"
                : "cursor-not-allowed bg-slate-800 text-slate-600")
            }
          >
            {t("save")}
          </button>
          {initial && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="mt-2 h-11 w-full rounded-xl text-sm font-medium text-rose-400 active:bg-slate-800"
            >
              {t("delete")}
            </button>
          )}
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
