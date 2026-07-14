import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, CURRENCIES } from "../../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../../lib/date";
import { valueHolding, applySell } from "../../../lib/holdings";
import { holdingRepo, type NewHolding, type TradeInput } from "../../../data/holdingRepo";
import type { Account, Holding, HoldingClass, Trade, TradeKind } from "../../../domain/types";
import {
  BASE_CURRENCY,
  CLASSES,
  inputClass,
  toMinor,
  toShares,
  fromMinor,
  displayShares,
} from "./shared";
import { Gain, Field, CashAccountField } from "./fields";

/** One holding: current value/gain/realized, buy/sell actions, and its trades. */
export function HoldingDetail({
  ledgerId,
  holding,
  accounts,
  fx,
  uid,
  onBack,
}: {
  ledgerId: string;
  holding: Holding;
  accounts: Account[];
  fx: Record<string, number>;
  uid: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const v = valueHolding(holding, fx);
  const [action, setAction] = useState<"none" | "buy" | "sell" | "edit">("none");

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex items-center gap-1 py-2 text-sm text-slate-400"
        >
          <span className="text-lg leading-none">‹</span>
          {t("investments")}
        </button>

        <div className="border-b border-slate-800 pb-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold tracking-tight">{holding.ticker}</span>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(v.valueBase, BASE_CURRENCY, locale)}
            </p>
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-slate-500">
            <span>
              {displayShares(holding.shares)} × {formatMoney(holding.price, holding.currency, locale)}
            </span>
            <span>
              {t("unrealized")} <Gain minor={v.gainBase} locale={locale} />
            </span>
          </div>
          {holding.realizedGain !== 0 && (
            <p className="mt-0.5 text-right text-xs text-slate-500">
              {t("realizedGain")}{" "}
              <Gain minor={holding.realizedGain} currency={holding.currency} locale={locale} />
            </p>
          )}
          {holding.dividendReceived > 0 && (
            <p className="mt-0.5 text-right text-xs text-slate-500">
              {t("dividendReceived")}{" "}
              <span className="tabular-nums text-sky-400">
                {formatMoney(holding.dividendReceived, holding.currency, locale)}
              </span>
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAction(action === "buy" ? "none" : "buy")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
          >
            {t("buyMore")}
          </button>
          <button
            type="button"
            onClick={() => setAction(action === "sell" ? "none" : "sell")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
            disabled={holding.shares <= 0}
          >
            {t("sell")}
          </button>
          <button
            type="button"
            onClick={() => setAction(action === "edit" ? "none" : "edit")}
            className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-slate-400"
          >
            {t("edit")}
          </button>
        </div>

        {(action === "buy" || action === "sell") && (
          <TradeForm
            kind={action}
            holding={holding}
            accounts={accounts}
            locale={locale}
            onCancel={() => setAction("none")}
            onSave={async (input) => {
              if (action === "buy") await holdingRepo.buy(ledgerId, holding, input, uid);
              else await holdingRepo.sell(ledgerId, holding, input, uid);
              setAction("none");
            }}
          />
        )}
        {action === "edit" && (
          <EditHoldingForm
            holding={holding}
            onCancel={() => setAction("none")}
            onSave={async (patch) => {
              await holdingRepo.update(ledgerId, holding.id, patch);
              setAction("none");
            }}
            onArchive={async () => {
              await holdingRepo.update(ledgerId, holding.id, { archived: true });
              onBack();
            }}
            onDelete={async () => {
              await holdingRepo.remove(ledgerId, holding);
              onBack();
            }}
          />
        )}

        <TradeLog ledgerId={ledgerId} holding={holding} locale={locale} />
      </div>
    </main>
  );
}

/** Edit a holding's descriptive fields (not shares/cost/price — those come from
 *  trades), plus archive or delete it. Delete undoes the paired cash transfers. */
function EditHoldingForm({
  holding,
  onSave,
  onArchive,
  onDelete,
  onCancel,
}: {
  holding: Holding;
  onSave: (patch: Partial<NewHolding & { dividendReceived: number }>) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState(holding.ticker);
  const [cls, setCls] = useState<HoldingClass>(holding.class);
  const [currency, setCurrency] = useState(holding.currency);
  const [target, setTarget] = useState(holding.targetPrice != null ? fromMinor(holding.targetPrice) : "");
  const [buyDate, setBuyDate] = useState(holding.buyDate ? toDateInputValue(holding.buyDate) : "");
  const [dividend, setDividend] = useState(
    holding.dividendReceived ? fromMinor(holding.dividendReceived) : "",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-800/40 p-3">
      <Field label={t("ticker")}>
        <input
          className={inputClass}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
        />
      </Field>
      <div className="flex gap-2">
        <Field label={t("category")}>
          <select
            className={inputClass}
            value={cls}
            onChange={(e) => setCls(e.target.value as HoldingClass)}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {t(`class_${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("currency")}>
          <select
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Field label={t("targetPrice")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field label={t("buyDate")}>
          <input
            type="date"
            className={inputClass}
            value={buyDate}
            onChange={(e) => setBuyDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label={`${t("dividendReceived")} (${holding.currency}, ${t("cumulative")})`}>
        <input
          className={inputClass}
          inputMode="decimal"
          value={dividend}
          onChange={(e) => setDividend(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-3 pt-1 text-sm">
        <button type="button" onClick={onCancel} className="text-slate-400">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={busy || ticker.trim() === ""}
          onClick={async () => {
            setBusy(true);
            await onSave({
              ticker: ticker.trim(),
              class: cls,
              currency: currency.trim() || "TWD",
              targetPrice: target ? toMinor(target) : null,
              buyDate: buyDate ? fromDateInputValue(buyDate) : null,
              dividendReceived: dividend ? toMinor(dividend) : 0,
            });
          }}
          className="font-medium text-emerald-400 disabled:text-slate-600"
        >
          {t("save")}
        </button>
      </div>

      {/* Archive / delete */}
      <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onArchive();
          }}
          className="text-slate-400"
        >
          {t("archive")}
        </button>
        {confirmDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDelete();
            }}
            className="font-medium text-rose-400"
          >
            {t("confirmDelete")}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-rose-400">
            {t("delete")}
          </button>
        )}
      </div>
    </div>
  );
}

function TradeForm({
  kind,
  holding,
  accounts,
  locale,
  onSave,
  onCancel,
}: {
  kind: TradeKind;
  holding: Holding;
  accounts: Account[];
  locale: string;
  onSave: (input: TradeInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState(fromMinor(holding.price));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [cashAccountId, setCashAccountId] = useState("");

  const sharesMinor = toShares(shares);
  const amountMinor = toMinor(amount);
  const isSell = kind === "sell";
  const valid = sharesMinor > 0 && (!isSell || sharesMinor <= holding.shares);
  const preview = isSell
    ? applySell({ shares: holding.shares, cost: holding.cost }, sharesMinor, amountMinor).realized
    : 0;

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-800/40 p-3">
      <div className="flex gap-2">
        <Field label={t("shares")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
          />
        </Field>
        <Field label={t("price")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label={isSell ? t("proceeds") : t("cost")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Field label={t("date")}>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <CashAccountField
          label={isSell ? t("settlementAccount") : t("fundingAccount")}
          accounts={accounts}
          currency={holding.currency}
          value={cashAccountId}
          onChange={setCashAccountId}
        />
      </div>
      {isSell && sharesMinor > 0 && (
        <p className="text-right text-xs text-slate-500">
          {t("realizedGain")} <Gain minor={preview} currency={holding.currency} locale={locale} />
        </p>
      )}
      {isSell && sharesMinor > holding.shares && (
        <p className="text-right text-xs text-rose-400">{t("notEnoughShares")}</p>
      )}
      <div className="flex justify-end gap-3 pt-1 text-sm">
        <button type="button" onClick={onCancel} className="text-slate-400">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSave({
              shares: sharesMinor,
              price: toMinor(price),
              amount: amountMinor,
              date: fromDateInputValue(date),
              cashAccountId: cashAccountId || null,
            })
          }
          className="font-medium text-emerald-400 disabled:text-slate-600"
        >
          {isSell ? t("sell") : t("buyMore")}
        </button>
      </div>
    </div>
  );
}

function TradeLog({
  ledgerId,
  holding,
  locale,
}: {
  ledgerId: string;
  holding: Holding;
  locale: string;
}) {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<Trade[]>([]);
  useEffect(() => {
    setTrades([]);
    return holdingRepo.subscribeTrades(ledgerId, holding.id, setTrades);
  }, [ledgerId, holding.id]);
  if (trades.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t("trades")}</h2>
      <ul className="divide-y divide-slate-800 text-sm">
        {trades.map((tr) => (
          <li key={tr.id} className="flex items-center gap-3 py-2">
            <span
              className={
                "w-9 shrink-0 text-xs " + (tr.kind === "buy" ? "text-emerald-400" : "text-rose-400")
              }
            >
              {tr.kind === "buy" ? t("buyShort") : t("sellShort")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-slate-300">
                {displayShares(tr.shares)} × {formatMoney(tr.price, holding.currency, locale)}
              </p>
              <p className="text-xs text-slate-500">{tr.date.toLocaleDateString(locale)}</p>
            </div>
            <span className="tabular-nums text-slate-400">
              {formatMoney(tr.amount, holding.currency, locale)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
