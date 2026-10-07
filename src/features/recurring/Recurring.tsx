import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, toMinor, toMajor } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { recurringRepo, type RecurringInput } from "../../data/recurringRepo";
import { TypeToggle } from "../../components/TypeToggle";
import { defaultPair, pickFrom, pickTo, swap, type TransferPair } from "../../lib/transferPair";
import type {
  Account,
  Category,
  EventType,
  RecurringFrequency,
  RecurringRule,
} from "../../domain/types";

const FREQS: RecurringFrequency[] = ["weekly", "monthly", "yearly"];
const TYPES: EventType[] = ["expense", "income", "transfer"];

function safeMinor(text: string): number {
  try {
    const m = toMinor(text.trim());
    return m >= 0 ? m : 0;
  } catch {
    return 0;
  }
}

export function Recurring({
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
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [editing, setEditing] = useState<null | { rule?: RecurringRule; copy?: boolean }>(null);

  useEffect(() => recurringRepo.subscribe(ledgerId, setRules), [ledgerId]);

  if (editing) {
    return (
      <RuleForm
        ledgerId={ledgerId}
        accounts={accounts}
        categories={categories}
        rule={editing.rule}
        copy={editing.copy}
        onCopy={
          editing.rule && !editing.copy
            ? () => setEditing({ rule: editing.rule, copy: true })
            : undefined
        }
        onClose={() => setEditing(null)}
      />
    );
  }

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
          <span className="text-sm font-semibold text-slate-300">{t("recurring")}</span>
          <button
            type="button"
            onClick={() => setEditing({})}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900"
          >
            {t("add")}
          </button>
        </header>

        {rules.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          TYPES.map((ty) => {
            const group = rules.filter((r) => r.type === ty);
            if (group.length === 0) return null;
            return (
              <section key={ty} className="mt-4 first:mt-0">
                <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                  {t(`type_${ty}` as "type_expense")}
                </h2>
                <ul className="divide-y divide-slate-800">
                  {group.map((r) => {
                    const account = accounts.find((a) => a.id === r.accountId);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setEditing({ rule: r })}
                          className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-slate-200">
                              {r.title || account?.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t(`freq_${r.frequency}` as "freq_monthly")}
                              {r.interval > 1 ? ` ×${r.interval}` : ""} ·{" "}
                              {toDateInputValue(r.nextDate)}
                            </p>
                          </div>
                          <span className="text-sm tabular-nums text-slate-200">
                            {formatMoney(r.amount, r.currency, i18n.language)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function RuleForm({
  ledgerId,
  accounts,
  categories,
  rule,
  copy,
  onCopy,
  onClose,
}: {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  rule?: RecurringRule;
  /** Copy mode: prefill from `rule` but save as a new rule (not an edit). */
  copy?: boolean;
  onCopy?: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState<EventType>(rule?.type ?? "expense");
  const [amountText, setAmountText] = useState(rule ? String(toMajor(rule.amount)) : "");
  const [title, setTitle] = useState(rule?.title ?? "");
  const [categoryId, setCategoryId] = useState<string>(rule?.categoryId ?? "");
  const [accountId, setAccountId] = useState(() => rule?.accountId ?? defaultPair(accounts).from);
  const [toAccountId, setToAccountId] = useState(
    () => rule?.toAccountId ?? defaultPair(accounts, rule?.accountId).to,
  );
  function setPair(p: TransferPair) {
    setAccountId(p.from);
    setToAccountId(p.to);
  }
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? "monthly");
  const [interval, setInterval] = useState(rule?.interval ?? 1);
  const [startDate, setStartDate] = useState<Date>(() => rule?.startDate ?? new Date());

  const minor = safeMinor(amountText);
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? "TWD";
  const isTransfer = type === "transfer";
  const canSave = minor > 0 && !!accountId && (!isTransfer || accountId !== toAccountId);

  function save() {
    if (!canSave) return;
    const input: RecurringInput = {
      type,
      amount: minor,
      currency,
      baseAmount: minor,
      baseCurrency: currency,
      fxRate: 1,
      categoryId: isTransfer ? null : categoryId || null,
      accountId,
      toAccountId: isTransfer ? toAccountId : null,
      title: title.trim(),
      note: null,
      frequency,
      interval: Math.max(1, interval),
      startDate,
    };
    if (rule && !copy) {
      const patch: Partial<RecurringRule> = { ...input };
      // Moving the start date resets nextDate, so future generation — and the
      // list's displayed "next" date — start there. Already-generated
      // occurrences stay idempotent by their deterministic id.
      if (rule.startDate.getTime() !== startDate.getTime()) patch.nextDate = startDate;
      void recurringRepo.update(ledgerId, rule.id, patch);
    } else {
      void recurringRepo.add(ledgerId, input);
    }
    onClose();
  }

  const field = "w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none [color-scheme:dark]";

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md space-y-3 px-4 pb-10 pt-4">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-300"
          >
            ✕
          </button>
          <span className="text-sm font-semibold text-slate-300">{t("recurring")}</span>
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
            setCategoryId("");
          }}
        />

        <input
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0"
          className={field + " text-center text-2xl"}
        />
        <div className="text-center text-xs text-slate-500">
          {formatMoney(minor, currency, i18n.language)}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className={field}
        />

        {!isTransfer && (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
            <option value="">— {t("category")} —</option>
            {categories
              .filter((c) => !c.archived && c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? c.icon + " " : ""}
                  {c.name}
                </option>
              ))}
          </select>
        )}

        <label className="block text-xs text-slate-500">{isTransfer ? t("from") : t("account")}</label>
        <select
          value={accountId}
          onChange={(e) =>
            isTransfer
              ? setPair(pickFrom({ from: accountId, to: toAccountId }, e.target.value))
              : setAccountId(e.target.value)
          }
          className={field}
        >
          {accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>

        {isTransfer && (
          <>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-500">{t("to")}</label>
              <button
                type="button"
                onClick={() => setPair(swap({ from: accountId, to: toAccountId }))}
                aria-label={t("swapAccounts")}
                title={t("swapAccounts")}
                className="rounded-full bg-slate-800 px-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                ⇅
              </button>
            </div>
            <select
              value={toAccountId}
              onChange={(e) => setPair(pickTo({ from: accountId, to: toAccountId }, e.target.value))}
              className={field}
            >
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </>
        )}

        {/* Frequency */}
        <label className="block text-xs text-slate-500">{t("every")}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value) || 1)}
            className="w-20 rounded-lg bg-slate-800 px-3 py-2.5 text-center text-base outline-none [color-scheme:dark]"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            className="flex-1 rounded-lg bg-slate-800 px-3 py-2.5 text-base outline-none [color-scheme:dark]"
          >
            {FREQS.map((f) => (
              <option key={f} value={f}>
                {t(`freq_${f}` as "freq_monthly")}
              </option>
            ))}
          </select>
        </div>

        {/* Start date */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">{t("startDate")}</label>
          <input
            type="date"
            value={toDateInputValue(startDate)}
            onChange={(e) => setStartDate(fromDateInputValue(e.target.value))}
            className={"flex-1 " + field}
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={
            "h-12 w-full rounded-xl text-base font-semibold " +
            (canSave
              ? "bg-emerald-500 text-slate-900 active:bg-emerald-400"
              : "cursor-not-allowed bg-slate-800 text-slate-600")
          }
        >
          {t("save")}
        </button>
        {rule && !copy && (
          <button
            type="button"
            onClick={() => {
              void recurringRepo.remove(ledgerId, rule.id);
              onClose();
            }}
            className="h-10 w-full rounded-xl text-sm font-medium text-rose-400 active:bg-slate-800"
          >
            {t("delete")}
          </button>
        )}
      </div>
    </div>
  );
}
