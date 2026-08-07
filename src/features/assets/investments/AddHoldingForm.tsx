import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CURRENCIES } from "../../../lib/money";
import { fromDateInputValue } from "../../../lib/date";
import { type NewHolding } from "../../../data/holdingRepo";
import type { Account, HoldingClass } from "../../../domain/types";
import { parseAmount, parseShares } from "../../../lib/money";
import { CLASSES, inputClass } from "./shared";
import { Field, CashAccountField } from "./fields";

export function AddHoldingForm({
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
  const [divPerShare, setDivPerShare] = useState("");
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
      {cls === "dividend" && (
        <Field label={t("dividendPerShare")}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={divPerShare}
            onChange={(e) => setDivPerShare(e.target.value)}
          />
        </Field>
      )}
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
              shares: parseShares(shares) ?? 0,
              price: parseAmount(price) ?? 0,
              cost: parseAmount(costValue) ?? 0,
              targetPrice: parseAmount(target),
              dividendPerShare: parseAmount(divPerShare) ?? 0,
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
