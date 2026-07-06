import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../lib/money";
import type { Account, Category, Transaction } from "../domain/types";

const SWIPE_DELETE_THRESHOLD = 80;

/** A transaction row: tap to edit, swipe left to delete. Shared by the Timeline
 *  and the account detail (which passes an optional per-row running balance). */
export function EntryRow({
  tx,
  locale,
  accounts,
  categories,
  onEdit,
  onDelete,
  runningBalance,
}: {
  tx: Transaction;
  locale: string;
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  runningBalance?: number;
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
        <div className="text-right">
          <span className={"text-sm tabular-nums " + amountColor}>
            {sign}
            {formatMoney(tx.amount, tx.currency, locale)}
          </span>
          {runningBalance !== undefined && (
            <span className="block text-xs tabular-nums text-slate-500">
              {formatMoney(runningBalance, tx.currency, locale)}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
