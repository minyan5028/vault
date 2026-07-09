import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { toDateInputValue, fromDateInputValue } from "../../lib/date";
import { valueHolding, portfolioTotals, applySell } from "../../lib/holdings";
import { holdingRepo, type NewHolding, type TradeInput } from "../../data/holdingRepo";
import { useHoldings } from "../../data/useHoldings";
import type {
  Account,
  Holding,
  HoldingClass,
  SnapshotEntry,
  Trade,
  TradeKind,
} from "../../domain/types";

const BASE_CURRENCY = "TWD";
const CLASSES: HoldingClass[] = ["growth", "dividend"];
/** Currency codes offered in the add form — a dropdown so a valid ISO 4217 code
 *  is always stored (a free-text typo like "TW" used to crash the page). */
const CURRENCIES = ["USD", "TWD", "JPY", "HKD", "EUR", "GBP", "CNY"];

const toMinor = (s: string) => Math.round(parseFloat(s || "0") * 100) || 0;
const toShares = (s: string) => Math.round(parseFloat(s || "0") * 10000) || 0;
const fromMinor = (n: number) => (n / 100).toString();
const fromShares = (n: number) => (n / 10000).toString();

/** Gain shown green when positive, rose when negative. */
function Gain({ minor, currency, locale }: { minor: number; currency?: string; locale: string }) {
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "";
  const color = minor > 0 ? "text-emerald-400" : minor < 0 ? "text-rose-400" : "text-slate-400";
  return (
    <span className={"tabular-nums " + color}>
      {sign}
      {formatMoney(Math.abs(minor), currency ?? BASE_CURRENCY, locale)}
    </span>
  );
}

/** Manage market-valued positions: view value/gain by class, add a holding,
 *  record a periodic valuation snapshot, and open a holding to buy/sell. */
export function Investments({
  ledgerId,
  accounts,
  uid,
  onBack,
}: {
  ledgerId: string;
  accounts: Account[];
  uid: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { holdings, fx } = useHoldings(ledgerId);
  const active = useMemo(() => holdings.filter((h) => !h.archived), [holdings]);
  const totals = useMemo(() => portfolioTotals(active, fx), [active, fx]);
  const [panel, setPanel] = useState<"none" | "add" | "update">("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = active.find((h) => h.id === selectedId);
  if (selected) {
    return (
      <HoldingDetail
        ledgerId={ledgerId}
        holding={selected}
        accounts={accounts}
        fx={fx}
        uid={uid}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-28 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex items-center gap-1 py-2 text-sm text-slate-400"
        >
          <span className="text-lg leading-none">‹</span>
          {t("assets")}
        </button>

        <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
          <span className="text-lg font-semibold tracking-tight">{t("investments")}</span>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(totals.valueBase, BASE_CURRENCY, locale)}
            </p>
            <Gain minor={totals.gainBase} locale={locale} />
          </div>
        </div>
        {totals.realizedBase !== 0 && (
          <p className="mt-1 text-right text-xs text-slate-500">
            {t("realizedGain")} <Gain minor={totals.realizedBase} locale={locale} />
          </p>
        )}

        <div className="mt-3 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPanel(panel === "add" ? "none" : "add")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
          >
            + {t("addHolding")}
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "update" ? "none" : "update")}
            className="rounded-full bg-slate-800 px-3 py-1 text-slate-200"
            disabled={active.length === 0}
          >
            {t("updatePrices")}
          </button>
        </div>

        {panel === "add" && (
          <AddHoldingForm
            accounts={accounts}
            onCancel={() => setPanel("none")}
            onSave={async (h) => {
              await holdingRepo.add(ledgerId, h, uid);
              setPanel("none");
            }}
          />
        )}
        {panel === "update" && (
          <UpdatePricesForm
            holdings={active}
            fx={fx}
            onClose={() => setPanel("none")}
            onSave={(snap) => holdingRepo.addSnapshot(ledgerId, snap)}
          />
        )}

        {active.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-600">{t("noHoldings")}</p>
        ) : (
          CLASSES.map((cls) => {
            const rows = active.filter((h) => h.class === cls);
            if (rows.length === 0) return null;
            const sub = totals.byClass[cls];
            return (
              <section key={cls} className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <h2 className="uppercase tracking-wide text-slate-400">{t(`class_${cls}`)}</h2>
                  <span className="tabular-nums text-slate-500">
                    {formatMoney(sub.valueBase, BASE_CURRENCY, locale)} ·{" "}
                    <Gain minor={sub.gainBase} locale={locale} />
                  </span>
                </div>
                <ul className="divide-y divide-slate-800">
                  {rows.map((h) => {
                    const v = valueHolding(h, fx);
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(h.id)}
                          className="flex w-full items-center gap-3 py-2 text-left text-sm active:bg-slate-800/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-slate-200">{h.ticker}</p>
                            <p className="text-xs text-slate-500">
                              {fromShares(h.shares)} × {formatMoney(h.price, h.currency, locale)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular-nums text-slate-100">
                              {formatMoney(v.valueBase, BASE_CURRENCY, locale)}
                            </p>
                            <Gain minor={v.gainBase} locale={locale} />
                          </div>
                          <span className="text-slate-600">›</span>
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
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-0.5 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600";

/** Picks the cash account a trade's money moves through — filtered to the
 *  holding's currency. Empty value = record no cash leg. */
function CashAccountField({
  label,
  accounts,
  currency,
  value,
  onChange,
}: {
  label: string;
  accounts: Account[];
  currency: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const opts = accounts.filter((a) => !a.archived && a.currency === currency);
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("noCashLeg")}</option>
        {opts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AddHoldingForm({
  accounts,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  onSave: (h: NewHolding) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState("");
  const [cls, setCls] = useState<HoldingClass>("growth");
  const [currency, setCurrency] = useState("USD");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [costEdited, setCostEdited] = useState(false);
  const [target, setTarget] = useState("");
  const [buyDate, setBuyDate] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const valid = ticker.trim() !== "" && shares !== "" && price !== "";

  // Cost defaults to shares × price (the opening buy) but stays overridable —
  // e.g. to fold in a brokerage fee. Once edited by hand it stops auto-updating.
  const autoCost =
    shares !== "" && price !== "" ? (parseFloat(shares) * parseFloat(price)).toFixed(2) : "";
  const costValue = costEdited ? cost : autoCost;

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-800/40 p-3">
      <Field label={t("ticker")}>
        <input
          className={inputClass}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="DIS"
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
        <Field label={t("cost")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={costValue}
            onChange={(e) => {
              setCost(e.target.value);
              setCostEdited(true);
            }}
          />
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
      <CashAccountField
        label={t("fundingAccount")}
        accounts={accounts}
        currency={currency.trim() || "TWD"}
        value={fundingAccountId}
        onChange={setFundingAccountId}
      />
      <div className="flex justify-end gap-3 pt-1 text-sm">
        <button type="button" onClick={onCancel} className="text-slate-400">
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSave({
              ticker: ticker.trim(),
              name: null,
              class: cls,
              currency: currency.trim() || "TWD",
              shares: toShares(shares),
              price: toMinor(price),
              cost: toMinor(costValue),
              targetPrice: target ? toMinor(target) : null,
              buyDate: buyDate ? fromDateInputValue(buyDate) : null,
              fundingAccountId: fundingAccountId || null,
            })
          }
          className="font-medium text-emerald-400 disabled:text-slate-600"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}

/** One holding: current value/gain/realized, buy/sell actions, and its trades. */
function HoldingDetail({
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
  const [action, setAction] = useState<"none" | "buy" | "sell">("none");

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
              {fromShares(holding.shares)} × {formatMoney(holding.price, holding.currency, locale)}
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
        </div>

        {action !== "none" && (
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

        <TradeLog ledgerId={ledgerId} holding={holding} locale={locale} />
      </div>
    </main>
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
                "w-9 shrink-0 text-xs " +
                (tr.kind === "buy" ? "text-emerald-400" : "text-rose-400")
              }
            >
              {tr.kind === "buy" ? t("buyShort") : t("sellShort")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-slate-300">
                {fromShares(tr.shares)} × {formatMoney(tr.price, holding.currency, locale)}
              </p>
              <p className="text-xs text-slate-500">
                {tr.date.toLocaleDateString(locale)}
              </p>
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

/**
 * Record a valuation snapshot, grouped by currency so each group updates on its
 * own schedule (TWD and USD holdings rarely update the same day). Submitting a
 * group writes only that group's holdings + its FX rate; other holdings keep
 * their previous pricedAt. Same-date groups merge into one snapshot.
 */
function UpdatePricesForm({
  holdings,
  fx,
  onSave,
  onClose,
}: {
  holdings: Holding[];
  fx: Record<string, number>;
  onSave: (snap: {
    date: string;
    entries: Record<string, SnapshotEntry>;
    fx: Record<string, number>;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map((h) => [h.id, fromMinor(h.price)])),
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map((h) => [h.id, fromShares(h.shares)])),
  );
  const currencies = [...new Set(holdings.map((h) => h.currency))];
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(currencies.map((c) => [c, (fx[c] ?? "").toString()])),
  );
  const [savedCur, setSavedCur] = useState<string | null>(null);

  async function submitGroup(cur: string) {
    const group = holdings.filter((h) => h.currency === cur);
    const entries: Record<string, SnapshotEntry> = {};
    for (const h of group)
      entries[h.id] = { price: toMinor(prices[h.id]), shares: toShares(shares[h.id]) };
    const fxOut: Record<string, number> = {};
    if (cur !== BASE_CURRENCY) fxOut[cur] = parseFloat(rates[cur] || "0") || 0;
    await onSave({ date, entries, fx: fxOut });
    setSavedCur(cur);
    setTimeout(() => setSavedCur((c) => (c === cur ? null : c)), 1500);
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-800/40 p-3">
      <Field label={t("date")}>
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      {currencies.map((cur) => {
        const group = holdings.filter((h) => h.currency === cur);
        return (
          <section key={cur} className="rounded-md bg-slate-800/40 p-2">
            <div className="mb-1 flex items-end justify-between gap-2">
              <h3 className="text-xs uppercase tracking-wide text-slate-400">{cur}</h3>
              {cur !== BASE_CURRENCY && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  {cur} → {BASE_CURRENCY}
                  <input
                    className="w-20 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
                    inputMode="decimal"
                    value={rates[cur] ?? ""}
                    onChange={(e) => setRates((r) => ({ ...r, [cur]: e.target.value }))}
                  />
                </label>
              )}
            </div>
            <ul className="space-y-2">
              {group.map((h) => (
                <li key={h.id} className="flex items-end gap-2">
                  <span className="w-14 shrink-0 truncate pb-1.5 text-sm text-slate-300">
                    {h.ticker}
                  </span>
                  <Field label={t("price")}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={prices[h.id] ?? ""}
                      onChange={(e) => setPrices((p) => ({ ...p, [h.id]: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("shares")}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={shares[h.id] ?? ""}
                      onChange={(e) => setShares((s) => ({ ...s, [h.id]: e.target.value }))}
                    />
                  </Field>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => submitGroup(cur)}
                className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-emerald-400"
              >
                {savedCur === cur ? `✓ ${cur}` : t("updateCurrency", { cur })}
              </button>
            </div>
          </section>
        );
      })}

      <div className="flex justify-end pt-1 text-sm">
        <button type="button" onClick={onClose} className="text-slate-400">
          {t("close")}
        </button>
      </div>
    </div>
  );
}
