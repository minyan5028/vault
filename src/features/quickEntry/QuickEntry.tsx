import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, toMinor, toMajor } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import type { Account, Category, EventType, Transaction } from "../../domain/types";
import { transactionRepo, type EntryDraft, type TitleSuggestion } from "../../data/transactionRepo";
import { holdingRepo } from "../../data/holdingRepo";
import { TypeToggle } from "../../components/TypeToggle";

interface QuickEntryProps {
  /** When present, edit this transaction instead of creating a new one. */
  initial?: Transaction;
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  onSubmit: (draft: EntryDraft) => void;
  onDelete?: () => void;
  /** When editing, offer "duplicate" — reopen prefilled as a new entry. */
  onCopy?: () => void;
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
export function QuickEntry({
  initial,
  ledgerId,
  accounts,
  categories,
  onSubmit,
  onDelete,
  onCopy,
  onClose,
}: QuickEntryProps) {
  const { t, i18n } = useTranslation();

  const [type, setType] = useState<EventType>(initial?.type ?? "expense");
  const [amountText, setAmountText] = useState(initial ? String(toMajor(initial.amount)) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    initial
      ? initial.categoryId
      : (categories.find((c) => c.type === "expense" && !c.archived)?.id ?? null),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState<Date>(() => initial?.date ?? new Date());
  const [showNote, setShowNote] = useState(!!initial?.note);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  // Cross-currency transfer: the amount credited to the destination, in its
  // currency (prefilled from the current FX rate, editable).
  const [fx, setFx] = useState<Record<string, number>>({});
  const [toAmountText, setToAmountText] = useState(
    initial && initial.toAmount !== initial.amount ? String(toMajor(initial.toAmount)) : "",
  );
  const [toAmountEdited, setToAmountEdited] = useState(false);
  useEffect(() => holdingRepo.subscribeFx(ledgerId, setFx), [ledgerId]);

  // Title autocomplete: suggest past titles (same shop) as you type.
  useEffect(() => {
    if (!titleFocused || !title.trim()) {
      setSuggestions([]);
      return;
    }
    const h = setTimeout(() => {
      transactionRepo
        .suggestTitles(ledgerId, title, 6)
        .then((s) => setSuggestions(s.filter((x) => x.title !== title)))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(h);
  }, [title, titleFocused, ledgerId]);

  const minor = useMemo(() => parseMinor(amountText), [amountText]);
  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "TWD";
  const isTransfer = type === "transfer";

  // Cross-currency when the two accounts hold different currencies. toAmount is
  // prefilled by converting `amount` at the current rate (fx maps a currency to
  // its rate into base TWD; base itself is 1) and stays editable.
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const toCurrency = toAccount?.currency ?? currency;
  const isCross = isTransfer && currency !== toCurrency;
  const autoToAmount =
    isCross && minor > 0
      ? String(toMajor(Math.round((minor * (fx[currency] ?? 1)) / (fx[toCurrency] ?? 1))))
      : "";
  const toAmountValue = toAmountEdited ? toAmountText : autoToAmount;
  const toAmountMinor = parseMinor(toAmountValue);

  const canSave = useMemo(() => {
    if (minor <= 0) return false;
    if (isTransfer) return accountId !== toAccountId && (!isCross || toAmountMinor > 0);
    // Expenses need a category; income's category is optional.
    return type === "expense" ? categoryId !== null : true;
  }, [minor, isTransfer, isCross, toAmountMinor, type, accountId, toAccountId, categoryId]);

  function save() {
    if (!canSave || saved) return;
    // baseAmount is the ledger-currency (TWD) value, locked at entry (ADR-0002),
    // so income/expense stats aggregate a single currency. A TWD account is 1:1;
    // a foreign account converts at the current rate.
    const rate = currency === "TWD" ? 1 : (fx[currency] ?? 1);
    onSubmit({
      type,
      amount: minor,
      currency,
      // Cross-currency transfer credits the destination its own-currency amount;
      // otherwise it equals `amount` (kept explicit so an edit can't leave a
      // stale toAmount from a previous cross-currency state).
      toAmount: isCross ? toAmountMinor : minor,
      baseAmount: Math.round(minor * rate),
      baseCurrency: "TWD",
      fxRate: rate,
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
            {t(onDelete ? "edit" : "newEntry")}
          </span>
          {onCopy ? (
            <button
              type="button"
              onClick={onCopy}
              aria-label={t("duplicate")}
              className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300"
            >
              ⧉
            </button>
          ) : (
            <span className="w-8" />
          )}
        </header>

        <TypeToggle
          value={type}
          onChange={(ty) => {
            setType(ty);
            if (ty !== "transfer") {
              setCategoryId(categories.find((c) => c.type === ty && !c.archived)?.id ?? null);
            }
          }}
        />

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
          <div className="relative mt-4">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTimeout(() => setTitleFocused(false), 150)}
              onKeyDown={(e) => {
                // "Done" just dismisses the keyboard — there may be more to edit
                // (category, account). Saving is an explicit tap on Save.
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              placeholder={t("titlePlaceholder")}
              className="w-full rounded-xl bg-slate-800 px-3 py-2 text-center text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
            />
            {titleFocused && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-slate-800 text-left shadow-lg ring-1 ring-slate-700">
                {suggestions.map((s) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep focus so the click registers
                        // Reuse the last-used shape for this title.
                        setTitle(s.title);
                        setType(s.type);
                        setAccountId(s.accountId);
                        if (s.categoryId) setCategoryId(s.categoryId);
                        if (s.toAccountId) setToAccountId(s.toAccountId);
                        setSuggestions([]);
                      }}
                      className="block w-full truncate px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Date — enlarged, right after the title (defaults to today) */}
        <section className="mb-4 flex items-center justify-center gap-2">
          <label className="text-sm text-slate-500">{t("date")}</label>
          <input
            type="date"
            value={toDateInputValue(date)}
            onChange={(e) => setDate(fromDateInputValue(e.target.value))}
            className="rounded-lg bg-slate-800 px-3 py-2 text-base text-slate-200 outline-none [color-scheme:dark]"
          />
        </section>

        {/* Category grid (hidden for transfers) or transfer destination */}
        {isTransfer ? (
          <>
            <TransferAccounts
              accounts={accounts}
              fromId={accountId}
              toId={toAccountId}
              onTo={setToAccountId}
              toLabel={t("to")}
            />
            {isCross && (
              <section className="mt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  {t("receivedAmount", { cur: toCurrency })}
                </p>
                <input
                  inputMode="decimal"
                  value={toAmountValue}
                  onChange={(e) => {
                    setToAmountText(sanitizeAmount(e.target.value));
                    setToAmountEdited(true);
                  }}
                  className="w-full rounded-xl bg-slate-800 px-3 py-2 text-center text-base tabular-nums text-slate-100 outline-none focus:ring-2 focus:ring-slate-600"
                />
                <p className="mt-1 text-center text-xs text-slate-500">
                  {formatMoney(minor, currency, i18n.language)} →{" "}
                  {formatMoney(toAmountMinor, toCurrency, i18n.language)}
                </p>
              </section>
            )}
          </>
        ) : (
          <section>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              {t("category")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {categories
                .filter((c) => !c.archived && c.type === type)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs " +
                      (categoryId === c.id
                        ? "bg-slate-700 ring-2 ring-slate-300"
                        : "bg-slate-800 text-slate-300")
                    }
                  >
                    <span className="text-base leading-none">{c.icon}</span>
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
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
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

        {/* Optional note */}
        <section className="mt-4 space-y-2">
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
  accounts,
  fromId,
  toId,
  onTo,
  toLabel,
}: {
  accounts: Account[];
  fromId: string;
  toId: string;
  onTo: (id: string) => void;
  toLabel: string;
}) {
  return (
    <section>
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{toLabel}</p>
      <div className="flex flex-wrap gap-2">
        {accounts
          .filter((a) => !a.archived)
          .map((a) => (
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
