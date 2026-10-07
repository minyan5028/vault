import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, toMinor, toMajor } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { selectableProjects, stampingProject } from "../../lib/project";
import type { Account, Category, EventType, Project, Transaction } from "../../domain/types";
import { transactionRepo, type EntryDraft, type TitleSuggestion } from "../../data/transactionRepo";
import { holdingRepo } from "../../data/holdingRepo";
import { TypeToggle } from "../../components/TypeToggle";
import { isImeKey } from "../../lib/keyboard";

interface QuickEntryProps {
  /** When present, edit this transaction instead of creating a new one. */
  initial?: Transaction;
  /**
   * New entry only: the date to start on, instead of today. Set when entry was
   * opened from a day heading — the user named the day, so it beats the "date
   * defaults to today" rule (docs/UX.md). Kept separate from `initial` so that
   * prefilling a date can never be mistaken for editing an existing event.
   */
  initialDate?: Date;
  /** New entry only: the account to start on, instead of the first/last used. */
  initialAccountId?: string;
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  /** Live Projects for the Ledger. Empty is the common case — the control is
   *  then absent and this screen is exactly what it was before ADR-0009. */
  projects: Project[];
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
  initialDate,
  initialAccountId,
  ledgerId,
  accounts,
  categories,
  projects,
  onSubmit,
  onDelete,
  onCopy,
  onClose,
}: QuickEntryProps) {
  const { t, i18n } = useTranslation();

  const [type, setType] = useState<EventType>(initial?.type ?? "expense");
  const [amountText, setAmountText] = useState(initial ? String(toMajor(initial.amount)) : "");
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? initialAccountId ?? accounts[0]?.id ?? "",
  );
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    initial
      ? initial.categoryId
      : (categories.find((c) => c.type === "expense" && !c.archived)?.id ?? null),
  );
  // Editing keeps whatever the event already carries. A new entry is stamped by
  // whichever Project is auto-assigning — but `projects` arrives from a
  // subscription, so it is usually empty on the first render and a useState
  // initializer would miss the stamp entirely. Derive it instead, and stop
  // deriving the moment the owner touches the field, so clearing one entry
  // sticks (and does not get re-stamped on the next re-render).
  const [chosenProject, setChosenProject] = useState<string | null>(initial?.projectId ?? null);
  const [projectTouched, setProjectTouched] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState<Date>(() => initial?.date ?? initialDate ?? new Date());
  const [showNote, setShowNote] = useState(!!initial?.note);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  // Keyboard-highlighted suggestion (desktop ↑/↓), -1 when none.
  const [active, setActive] = useState(-1);
  const titleRef = useRef<HTMLInputElement>(null);
  // The title last taken from a suggestion — once picked, it is not offered
  // back to the owner as a suggestion of itself.
  const pickedTitle = useRef<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Set by a pick; moves focus on the next render, once the picked category
  // has had the chance to enable Save.
  const [focusAfterPick, setFocusAfterPick] = useState(false);
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
    if (!titleFocused || !title.trim() || title === pickedTitle.current) {
      setSuggestions([]);
      return;
    }
    const h = setTimeout(() => {
      transactionRepo
        .suggestTitles(ledgerId, title, 6)
        // An exact match stays, first: typing the whole name and then picking
        // it is how its category and account come along.
        .then((s) => {
          const q = title.trim();
          setSuggestions([...s.filter((x) => x.title === q), ...s.filter((x) => x.title !== q)]);
          setActive(-1);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(h);
  }, [title, titleFocused, ledgerId]);

  // Stamped by the entry's own date, the same date the picker follows — not by
  // wall-clock now. Tapping a day heading from before a running trip must not
  // file that day's grocery run under the trip.
  const stamped = useMemo(
    () => (initial ? null : (stampingProject(projects, date)?.id ?? null)),
    [projects, initial, date],
  );
  const projectId = initial || projectTouched ? chosenProject : stamped;
  const pickProject = (id: string | null) => {
    setProjectTouched(true);
    setChosenProject(id);
  };

  // Which Projects are worth offering for *this* entry — see
  // `selectableProjects`. Follows the date field, so pushing an entry back into
  // a finished trip brings that trip back into the picker.
  const offered = useMemo(
    () => selectableProjects(projects, date, new Date(), projectId),
    [projects, date, projectId],
  );

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
      // Deliberately kept on every type, transfers included: buying foreign
      // cash for a trip is worth tracing to it, even though a transfer moves
      // no total (ADR-0009).
      projectId,
      accountId,
      toAccountId: isTransfer ? toAccountId : null,
      title: title.trim(),
      note: showNote ? note.trim() || null : null,
    });
    setSaved(true); // brief ✓ before returning to the Timeline
    setTimeout(onClose, 550);
  }

  // Reuse the last-used shape for this title.
  function pickSuggestion(s: TitleSuggestion) {
    pickedTitle.current = s.title;
    setTitle(s.title);
    setType(s.type);
    setAccountId(s.accountId);
    if (s.categoryId) setCategoryId(s.categoryId);
    if (s.toAccountId) setToAccountId(s.toAccountId);
    setSuggestions([]);
    setActive(-1);
    setFocusAfterPick(true);
  }

  // After a pick the entry is often complete: land on Save, so the next Enter
  // saves. Without an amount yet, go back up for it instead.
  useEffect(() => {
    if (!focusAfterPick) return;
    setFocusAfterPick(false);
    if (canSave) saveRef.current?.focus();
    else if (minor <= 0) amountRef.current?.focus();
  }, [focusAfterPick, canSave, minor]);

  // Cmd/Ctrl+Enter saves from any field (desktop).
  const saveLatest = useRef(save);
  saveLatest.current = save;

  // Esc closes the overlay; Cmd/Ctrl+Enter saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // A key an IME is using to pick or cancel a candidate is not a command.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveLatest.current();
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
            ref={amountRef}
            inputMode="decimal"
            enterKeyHint="next"
            autoFocus
            value={amountText}
            onChange={(e) => setAmountText(sanitizeAmount(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
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
              onChange={(e) => {
                pickedTitle.current = null; // typing again re-opens suggestions
                setTitle(e.target.value);
              }}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTimeout(() => setTitleFocused(false), 150)}
              onKeyDown={(e) => {
                if (isImeKey(e)) return;
                const open = titleFocused && suggestions.length > 0;
                if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                  e.preventDefault();
                  // Cycles through -1 (nothing highlighted) and each row.
                  const n = suggestions.length + 1;
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setActive((i) => ((i + 1 + step + n) % n) - 1);
                  return;
                }
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  if (open && active >= 0) {
                    pickSuggestion(suggestions[active]);
                    return;
                  }
                  // "Done" just dismisses the keyboard — there may be more to
                  // edit (category, account). Saving is an explicit tap on Save.
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              placeholder={t("titlePlaceholder")}
              className="w-full rounded-xl bg-slate-800 px-3 py-2 text-center text-base text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
            />
            {titleFocused && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-slate-800 text-left shadow-lg ring-1 ring-slate-700">
                {suggestions.map((s, i) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep focus so the click registers
                        pickSuggestion(s);
                      }}
                      className={
                        "block w-full truncate px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 " +
                        (i === active ? "bg-slate-700" : "")
                      }
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

        {/* Project — the second classification axis (ADR-0009). Absent entirely
            when the Ledger has none, so the everyday path is untouched. */}
        {(offered.length > 0 || projectId !== null) && (
          <section className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("projects")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pickProject(null)}
                className={
                  "rounded-full px-3 py-1 text-sm " +
                  (projectId === null
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-800 text-slate-300")
                }
              >
                {t("noProject")}
              </button>
              {offered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProject(p.id)}
                  className={
                    "rounded-full px-3 py-1 text-sm " +
                    (projectId === p.id
                      ? "bg-slate-100 text-slate-900"
                      : "bg-slate-800 text-slate-300")
                  }
                >
                  {p.name}
                </button>
              ))}
              {/* The attached Project was soft-deleted, so nothing in `offered`
                  matches it. Without a chip of its own the picker would show
                  every option unselected while the entry does carry one. */}
              {projectId !== null && !offered.some((p) => p.id === projectId) && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm italic text-slate-500">
                  {t("deletedProject")}
                </span>
              )}
            </div>
          </section>
        )}

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
            ref={saveRef}
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
