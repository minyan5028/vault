import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../lib/money";
import { endpointName, type LedgerEndpoint } from "../lib/endpoints";
import type { Account, Category, Project, Transaction } from "../domain/types";

const SWIPE_DELETE_THRESHOLD = 80;

/** A transaction row: tap to edit, swipe left to delete. Shared by the Timeline
 *  and the account detail (which passes an optional per-row running balance). */
export function EntryRow({
  tx,
  locale,
  endpoints,
  categories,
  projects,
  onEdit,
  onDelete,
  runningBalance,
  authorName,
  viewAccount,
}: {
  tx: Transaction;
  locale: string;
  /** Every id a Financial Event can name — Accounts and Holdings alike. A
   *  trade's cash leg points at a Holding, so an account-only lookup would
   *  render it nameless. */
  endpoints: ReadonlyMap<string, LedgerEndpoint>;
  categories: Category[];
  /** Used only to name a Project on the rows that belong to one. */
  projects?: Project[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  runningBalance?: number;
  /** In shared ledgers, the member who created this entry (omitted for one's own). */
  authorName?: string;
  /** Account-detail context: show the figure from this account's perspective —
   *  its credited toAmount when it's the transfer destination, in its own
   *  currency. Omit on the Timeline (source-currency view). */
  viewAccount?: Account;
}) {
  const { t } = useTranslation();
  const category = categories.find((c) => c.id === tx.categoryId);
  // Named, not just flagged. Automatic stamping (ADR-0009) is the main new way
  // to be wrong — an order placed from home mid-trip gets the trip — and a
  // wrong stamp is invisible in a list where every row looks identical. Rows
  // with no Project are untouched, so everyday review gains no clutter.
  const project = tx.projectId ? projects?.find((p) => p.id === tx.projectId) : undefined;
  // A soft-deleted Project leaves its events pointing at it (ADR-0004). Naming
  // it "deleted" rather than rendering nothing keeps the row distinguishable
  // from everyday spending — which is the whole reason the marker exists.
  const projectLabel = tx.projectId ? (project?.name ?? t("deletedProject")) : null;
  const from = endpointName(tx.accountId, endpoints);
  const to = endpointName(tx.toAccountId, endpoints);
  const route = `${from} → ${to}`;
  const label = tx.title || (tx.type === "transfer" ? route : category?.name) || "";
  // A titled transfer still owes the reader its direction; an untitled one
  // already shows it as the label.
  const subtitle = tx.type === "transfer" && tx.title ? route : from;
  // On an account detail, this row's figure is that account's own movement: the
  // credited toAmount (in its currency) when it's the transfer destination,
  // otherwise amount. On the Timeline it's the source amount/currency.
  const isDest = viewAccount != null && tx.toAccountId === viewAccount.id && tx.accountId !== viewAccount.id;
  const shownAmount = isDest ? tx.toAmount : tx.amount;
  const shownCurrency = viewAccount ? viewAccount.currency : tx.currency;
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
          <p className="truncate text-xs text-slate-500">
            {subtitle}
            {authorName && <span className="text-slate-600"> · {authorName}</span>}
            {projectLabel && (
              <span className={project ? "text-emerald-500/80" : "italic text-slate-600"}>
                {" · "}
                {projectLabel}
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <span className={"text-sm tabular-nums " + amountColor}>
            {sign}
            {formatMoney(shownAmount, shownCurrency, locale)}
          </span>
          {runningBalance !== undefined && (
            <span className="block text-xs tabular-nums text-slate-500">
              {formatMoney(runningBalance, shownCurrency, locale)}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
