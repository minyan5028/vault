import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, CURRENCIES } from "../../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../../lib/date";
import {
  valueHolding,
  applySell,
  avgCost,
  dividendMetrics,
  estimatedDividends,
  positionAsOf,
  replayTrades,
  yieldOnCost,
} from "../../../lib/holdings";
import {
  holdingRepo,
  type NewHolding,
  type TradeContext,
  type TradeEdit,
  type TradeOutcome,
  type TradeInput,
} from "../../../data/holdingRepo";
import type {
  Account,
  Holding,
  HoldingClass,
  PortfolioSnapshot,
  Trade,
  TradeKind,
} from "../../../domain/types";
import {
  amountInput,
  formatShares,
  parseAmount,
  parseShares,
  sharesInput,
} from "../../../lib/money";
import { BASE_CURRENCY, CLASSES, inputClass, atTarget, formatPct } from "./shared";
import { Gain, Field, CashAccountField } from "./fields";

/** A labelled figure in the buy-info grid (label above, value below). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums text-slate-300">{value}</dd>
    </div>
  );
}

/** One holding: current value/gain/realized, buy/sell actions, and its trades. */
export function HoldingDetail({
  ledgerId,
  holding,
  accounts,
  fx,
  snapshots,
  uid,
  onBack,
}: {
  ledgerId: string;
  holding: Holding;
  accounts: Account[];
  fx: Record<string, number>;
  snapshots: PortfolioSnapshot[];
  uid: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const v = valueHolding(holding, fx);
  const [action, setAction] = useState<"none" | "buy" | "sell" | "edit">("none");

  // Trades drive both the log and the DRIP-dividend estimate, so subscribe once
  // here and hand them down rather than re-subscribing in the log.
  // null until the subscription has spoken. It matters: cost, realizedGain and
  // buyDate are written **absolutely** from this log, so acting on a log that
  // has not arrived yet would overwrite a real cost basis with whatever single
  // trade was just recorded. An empty array is a claim ("no trades"); null is
  // the absence of one.
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => {
    setTrades(null);
    return holdingRepo.subscribeTrades(ledgerId, holding.id, setTrades);
  }, [ledgerId, holding.id]);

  // The fold needs the log the trade joins and where the valuation axis has got
  // to; both are already on screen, so a correction costs no extra read.
  //
  // The boundary is the newest snapshot that priced **this** holding, not the
  // ledger's newest: readings are recorded per currency group, so a USD
  // snapshot says nothing about a TWD position, and treating it as one would
  // drop a TWD purchase out of the held count entirely.
  const lastPriced = [...snapshots].reverse().find((s) => s.entries[holding.id]);
  const latestSnapshot = lastPriced ? fromDateInputValue(lastPriced.date) : null;
  const ready = trades !== null;
  const log = trades ?? [];
  const ctx: TradeContext = { trades: log, latestSnapshot, heldShares: holding.shares };
  // What the log says was bought, against what the broker says is held. They
  // differ by reinvestment, which is the model rather than a discrepancy.
  const fold = replayTrades(log);
  const tradedShares = ready && fold.ok ? fold.tradedShares : null;
  const [refusal, setRefusal] = useState<string | null>(null);

  const now = Date.now();
  const dm = holding.class === "dividend" ? dividendMetrics(holding, v.valueCur, now) : null;
  // DRIP dividends reverse-derived from snapshot share growth (see the lib fn).
  const estDiv =
    holding.class === "dividend" ? estimatedDividends(holding.id, snapshots, log) : 0;
  const estYield = yieldOnCost(estDiv, holding.cost, holding.buyDate, now);

  /** Surface a refused trade write, and say whether the caller may proceed. */
  const report = (outcome: TradeOutcome): boolean => {
    if (outcome.ok) {
      setRefusal(null);
      return true;
    }
    const { blockedBy, remaining } = outcome;
    setRefusal(
      t("tradeRefused", {
        shares: formatShares(remaining),
        kind: blockedBy.kind === "buy" ? t("buyShort") : t("sellShort"),
        date: blockedBy.date.toLocaleDateString(locale),
      }),
    );
    return false;
  };

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
            <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {holding.ticker}
              {atTarget(holding) && (
                <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-400">
                  {t("atTarget")}
                </span>
              )}
            </span>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(v.valueBase, BASE_CURRENCY, locale)}
            </p>
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-slate-500">
            <span>
              {formatShares(holding.shares)} × {formatMoney(holding.price, holding.currency, locale)}
            </span>
            <span>
              {t("unrealized")} <Gain minor={v.gainBase} locale={locale} pct={v.gainPct} />
            </span>
          </div>

          {tradedShares != null && tradedShares !== holding.shares && (
            <p className="mt-1 text-xs text-slate-500">
              {t("tradedShares")} {formatShares(tradedShares)} · {t("heldShares")}{" "}
              {formatShares(holding.shares)}
              <span className="ml-1 text-sky-400">
                {t("fromReinvestment", {
                  shares: formatShares(Math.abs(holding.shares - tradedShares)),
                })}
              </span>
            </p>
          )}

          {/* Buy info — cost basis, average cost, when and the review target. */}
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Stat label={t("cost")} value={formatMoney(holding.cost, holding.currency, locale)} />
            <Stat
              label={t("avgCost")}
              value={formatMoney(avgCost(holding.cost, holding.shares), holding.currency, locale)}
            />
            {holding.buyDate && (
              <Stat label={t("buyDate")} value={holding.buyDate.toLocaleDateString(locale)} />
            )}
            {holding.targetPrice != null && (
              <Stat
                label={t("targetPrice")}
                value={formatMoney(holding.targetPrice, holding.currency, locale)}
              />
            )}
          </dl>

          {holding.realizedGain !== 0 && (
            <p className="mt-1 text-right text-xs text-slate-500">
              {t("realizedGain")}{" "}
              <Gain minor={holding.realizedGain} currency={holding.currency} locale={locale} />
            </p>
          )}
          {holding.class !== "dividend" && holding.dividendReceived > 0 && (
            <p className="mt-0.5 text-right text-xs text-slate-500">
              {t("dividendReceived")}{" "}
              <span className="tabular-nums text-sky-400">
                {formatMoney(holding.dividendReceived, holding.currency, locale)}
              </span>
            </p>
          )}
        </div>

        {/* Dividend reference — income & yields; never part of net worth. */}
        {dm && (holding.dividendReceived > 0 || dm.annualIncome > 0 || estDiv > 0) && (
          <dl className="mt-3 space-y-1.5 rounded-lg bg-slate-800/40 p-3 text-xs">
            {estDiv > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-slate-500">{t("estimatedDividends")}</dt>
                <dd className="text-right tabular-nums text-sky-400">
                  {formatMoney(estDiv, holding.currency, locale)}
                  {estYield.onCost != null && (
                    <span className="ml-1 text-slate-400">
                      · {formatPct(estYield.onCost)} {t("yieldOnCost")}
                      {estYield.annualized != null &&
                        ` (${formatPct(estYield.annualized)} ${t("annualized")})`}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {dm.annualIncome > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-slate-500">{t("annualIncome")}</dt>
                <dd className="text-right tabular-nums text-sky-400">
                  {formatMoney(dm.annualIncome, holding.currency, locale)}
                  {dm.currentYield != null && (
                    <span className="ml-1 text-slate-400">
                      · {formatPct(dm.currentYield)} {t("currentYield")}
                    </span>
                  )}
                  {dm.forwardYieldOnCost != null && (
                    <span className="ml-1 text-slate-400">
                      · {formatPct(dm.forwardYieldOnCost)} {t("yieldOnCost")}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {holding.dividendReceived > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-slate-500">
                  {t("dividendReceived")} · {t("cumulative")}
                </dt>
                <dd className="text-right tabular-nums text-sky-400">
                  {formatMoney(holding.dividendReceived, holding.currency, locale)}
                  {dm.cumulativeYieldOnCost != null && (
                    <span className="ml-1 text-slate-400">
                      · {formatPct(dm.cumulativeYieldOnCost)} {t("yieldOnCost")}
                      {dm.annualizedYieldOnCost != null &&
                        ` (${formatPct(dm.annualizedYieldOnCost)} ${t("annualized")})`}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}

        {refusal && (
          <p className="mt-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{refusal}</p>
        )}

        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAction(action === "buy" ? "none" : "buy")}
            disabled={!ready}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200 disabled:text-slate-600"
          >
            {t("buyMore")}
          </button>
          <button
            type="button"
            onClick={() => setAction(action === "sell" ? "none" : "sell")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200 disabled:text-slate-600"
            disabled={!ready || holding.shares <= 0}
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
            trades={log}
            heldShares={holding.shares}
            accounts={accounts}
            locale={locale}
            onCancel={() => setAction("none")}
            onSave={async (input) => {
              const outcome =
                action === "buy"
                  ? await holdingRepo.buy(ledgerId, holding, ctx, input, uid)
                  : await holdingRepo.sell(ledgerId, holding, ctx, input, uid);
              if (!report(outcome)) return;
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

        <TradeLog
          trades={log}
          holding={holding}
          locale={locale}
          onEdit={async (tradeId, patch) =>
            report(await holdingRepo.editTrade(ledgerId, holding.id, ctx, tradeId, patch))
          }
          onDelete={async (tradeId) =>
            report(await holdingRepo.deleteTrade(ledgerId, holding.id, ctx, tradeId))
          }
        />
      </div>
    </main>
  );
}

/**
 * Edit a holding's genuinely descriptive fields, plus archive or delete it.
 * Delete undoes the paired cash transfers.
 *
 * Not shares, cost or price: those belong to the trades and the snapshots
 * (ADR-0010). Not the purchase date either — it is the opening buy's date, and
 * it is corrected in the trade log, which is where it actually lives. Editing a
 * second copy here is what made a corrected date appear not to save.
 */
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
  const [target, setTarget] = useState(holding.targetPrice != null ? amountInput(holding.targetPrice) : "");
  const [dividend, setDividend] = useState(
    holding.dividendReceived ? amountInput(holding.dividendReceived) : "",
  );
  const [divPerShare, setDivPerShare] = useState(
    holding.dividendPerShare ? amountInput(holding.dividendPerShare) : "",
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
      <Field label={t("targetPrice")}>
        <input
          className={inputClass}
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </Field>
      {cls === "dividend" && (
        <div className="flex gap-2">
          <Field label={`${t("dividendReceived")} (${t("cumulative")})`}>
            <input
              className={inputClass}
              inputMode="decimal"
              value={dividend}
              onChange={(e) => setDividend(e.target.value)}
            />
          </Field>
          <Field label={t("dividendPerShare")}>
            <input
              className={inputClass}
              inputMode="decimal"
              value={divPerShare}
              onChange={(e) => setDivPerShare(e.target.value)}
            />
          </Field>
        </div>
      )}
      {cls !== "dividend" && (
        <Field label={`${t("dividendReceived")} (${holding.currency}, ${t("cumulative")})`}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={dividend}
            onChange={(e) => setDividend(e.target.value)}
          />
        </Field>
      )}
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
              targetPrice: parseAmount(target),
              dividendReceived: parseAmount(dividend) ?? 0,
              dividendPerShare: parseAmount(divPerShare) ?? 0,
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
  trades,
  heldShares,
  accounts,
  locale,
  onSave,
  onCancel,
}: {
  kind: TradeKind;
  holding: Holding;
  /** The log this trade joins. A sell is measured against the position **as of
   *  its own date**, because that is what the fold will do — the form has to
   *  promise the same realized gain the write produces. It is also the traded
   *  count rather than the held one: the fold only knows about shares a trade
   *  put there (ADR-0010), which for a reinvesting holding is fewer than the
   *  broker reports. See the reconciliation line on the detail screen. */
  trades: readonly Trade[];
  /** What the broker says is held. A reinvesting position can be sold down
   *  beyond what the log accounts for, and the sale is apportioned against this
   *  — the same figure the write freezes onto the trade. */
  heldShares: number;
  accounts: Account[];
  locale: string;
  onSave: (input: TradeInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState(amountInput(holding.price));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [cashAccountId, setCashAccountId] = useState("");

  const sharesMinor = parseShares(shares) ?? 0;
  const amountMinor = parseAmount(amount) ?? 0;
  const isSell = kind === "sell";
  // The position the fold will see when it reaches this trade: everything dated
  // on or before it. A backdated sell is measured against what was held then,
  // not against today.
  const asOf = positionAsOf(trades, fromDateInputValue(date));
  // The denominator the write will freeze onto this sale: the larger of what
  // the log accounts for on that date and what the broker says is held.
  const available = Math.max(asOf.ok ? asOf.tradedShares : 0, heldShares);
  const valid = sharesMinor > 0 && (!isSell || sharesMinor <= available);
  const preview =
    isSell && asOf.ok
      ? applySell({ shares: available, cost: asOf.cost }, sharesMinor, amountMinor).realized
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
      {isSell && sharesMinor > available && (
        <p className="text-right text-xs text-rose-400">
          {t("notEnoughTradedShares", { shares: formatShares(available) })}
        </p>
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
              price: parseAmount(price) ?? 0,
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
  trades,
  holding,
  locale,
  onEdit,
  onDelete,
}: {
  trades: Trade[];
  holding: Holding;
  locale: string;
  onEdit: (tradeId: string, patch: TradeEdit) => Promise<boolean>;
  onDelete: (tradeId: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  if (trades.length === 0) return null;
  const ordered = [...trades].sort((a, b) => b.date.getTime() - a.date.getTime());
  return (
    <section className="mt-5">
      <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t("trades")}</h2>
      <ul className="divide-y divide-slate-800 text-sm">
        {ordered.map((tr) => (
          <li key={tr.id} className="py-1">
            <button
              type="button"
              onClick={() => setEditing(editing === tr.id ? null : tr.id)}
              className="flex w-full items-center gap-3 py-1 text-left"
            >
              <span
                className={
                  "w-9 shrink-0 text-xs " +
                  (tr.kind === "buy" ? "text-emerald-400" : "text-rose-400")
                }
              >
                {tr.kind === "buy" ? t("buyShort") : t("sellShort")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-300">
                  {formatShares(tr.shares)} × {formatMoney(tr.price, holding.currency, locale)}
                </p>
                <p className="text-xs text-slate-500">{tr.date.toLocaleDateString(locale)}</p>
              </div>
              <span className="tabular-nums text-slate-400">
                {formatMoney(tr.amount, holding.currency, locale)}
              </span>
            </button>
            {editing === tr.id && (
              <EditTradeForm
                trade={tr}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  if (await onEdit(tr.id, patch)) setEditing(null);
                }}
                onDelete={async () => {
                  if (await onDelete(tr.id)) setEditing(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Correct one trade in place, or delete it.
 *
 * The cash account is deliberately absent: moving a trade to a different
 * account means deleting it and recording it again (ADR-0010's scope). Everything
 * offered here re-folds the holding's cost basis, and a correction the log
 * cannot support comes back refused rather than clamped.
 */
function EditTradeForm({
  trade,
  onSave,
  onDelete,
  onCancel,
}: {
  trade: Trade;
  onSave: (patch: TradeEdit) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(toDateInputValue(trade.date));
  const [shares, setShares] = useState(sharesInput(trade.shares));
  const [price, setPrice] = useState(amountInput(trade.price));
  const [amount, setAmount] = useState(amountInput(trade.amount));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const sharesMinor = parseShares(shares) ?? 0;
  const isSell = trade.kind === "sell";
  const unlinked = trade.transferId === undefined;

  return (
    <div className="mb-2 space-y-2 rounded-lg bg-slate-800/40 p-3">
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
      <Field label={t("date")}>
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      {unlinked && <p className="text-xs text-amber-400/80">{t("cashLegNotLinked")}</p>}

      <div className="flex items-center gap-3 pt-1 text-sm">
        {confirmDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDelete();
              setBusy(false);
            }}
            className="text-xs text-rose-400"
          >
            {t("confirmDelete")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-slate-500"
          >
            {t("delete")}
          </button>
        )}
        <button type="button" onClick={onCancel} className="ml-auto text-slate-400">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={busy || sharesMinor <= 0}
          onClick={async () => {
            setBusy(true);
            await onSave({
              date: fromDateInputValue(date),
              shares: sharesMinor,
              price: parseAmount(price) ?? 0,
              amount: parseAmount(amount) ?? 0,
            });
            setBusy(false);
          }}
          className="font-medium text-emerald-400 disabled:text-slate-600"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}
