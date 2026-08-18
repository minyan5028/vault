/**
 * Every write Vault makes, decided as a value.
 *
 * These functions are the "what changes" half of the write path: given the
 * event (and, for an edit or delete, the document as it is stored), they return
 * a WritePlan. Nothing here imports Firestore, so the rules — which documents
 * are touched, in what order, with which increments — are assertable in a plain
 * unit test. `firestoreExec` is the other half, and the repos are the thin
 * seam between: read → plan → execute.
 */
import { yearMonthOf } from "../lib/date";
import { applySell } from "../lib/holdings";
import {
  combineEffects,
  ledgerEffect,
  mergedEvent,
  storedEvent,
  type EventProjectionFields,
  type LedgerEffect,
  type StoredEventFields,
} from "../lib/ledgerEffect";
import type { RollupContribution } from "../lib/rollup";
import {
  BREAKDOWNS,
  type EventType,
  type Holding,
  type SnapshotEntry,
  type TradeKind,
} from "../domain/types";
import {
  atTime,
  balanceRollupPath,
  concatPlans,
  fxPath,
  holdingPath,
  incrementBy,
  monthRollupPath,
  projectPath,
  serverTime,
  snapshotPath,
  tradePath,
  transactionPath,
  type PlanData,
  type PlanValue,
  type WriteOp,
  type WritePlan,
} from "./writePlan";

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface NewTransactionInput {
  type: EventType;
  amount: number;
  currency: string;
  /** Cross-currency transfer only: amount credited to toAccountId in its
   *  currency. Omit for same-currency / income / expense (defaults to amount). */
  toAmount?: number;
  baseAmount: number;
  baseCurrency: string;
  fxRate: number;
  date: Date;
  categoryId: string | null;
  /** The Project this event belongs to, null for everyday spending (ADR-0009). */
  projectId: string | null;
  accountId: string;
  toAccountId: string | null;
  title: string;
  note: string | null;
  createdBy: string;
}

/** What Quick Entry produces; the repo/caller adds `createdBy`. */
export type EntryDraft = Omit<NewTransactionInput, "createdBy">;

export interface NewHolding {
  ticker: string;
  name: string | null;
  class: Holding["class"];
  currency: string;
  cost: number;
  shares: number;
  price: number;
  targetPrice: number | null;
  dividendPerShare: number;
  buyDate: Date | null;
  /** Cash account the opening buy is paid from; null keeps the holding
   *  standalone (no cash leg). */
  fundingAccountId: string | null;
}

/** A buy (加碼) or sell (賣出) against an existing holding. */
export interface TradeInput {
  /** Shares transacted (×10000). */
  shares: number;
  /** Per-share price (×100). */
  price: number;
  /** Cash moved (×100): a buy's cost paid, a sell's proceeds received. */
  amount: number;
  date: Date;
  /** Cash account the money comes from (buy) / lands in (sell); null = no cash
   *  leg. Must match the holding's currency. */
  cashAccountId: string | null;
}

/** Document ids the caller allocates up front, so a plan is fully determined
 *  by its inputs (and therefore assertable). */
export interface TradeIds {
  tradeId: string;
  /** Only needed when the trade has a cash leg. */
  transferId?: string;
}

// ── Projection writes ─────────────────────────────────────────────────────────

/**
 * Turn a signed month contribution into an atomic-increment set-merge payload.
 * Zero fields are omitted, and an all-zero category map is dropped entirely —
 * under `{ merge: true }` an EMPTY map is a leaf, so writing one would replace
 * the whole map instead of merging into it (see `planEffect`).
 */
function monthRollupData(yearMonth: string, c: RollupContribution): PlanData {
  const data: PlanData = { yearMonth, updatedAt: serverTime() };
  if (c.income !== 0) data.income = incrementBy(c.income);
  if (c.expense !== 0) data.expense = incrementBy(c.expense);
  const increments = (m: Record<string, number>): PlanData | null => {
    const out: PlanData = {};
    for (const [k, v] of Object.entries(m)) if (v !== 0) out[k] = incrementBy(v);
    return Object.keys(out).length ? out : null;
  };
  for (const b of BREAKDOWNS) {
    const map = increments(c[b]);
    if (map) data[b] = map;
  }
  return data;
}

/**
 * The rollup writes for a LedgerEffect — the only route by which a projection
 * change reaches storage.
 *
 * An effect that moves nothing produces no ops at all. This matters: never emit
 * `{ netFlow: {} }`. Under `{ merge: true }` Firestore builds its field mask
 * from the payload's leaves, and an empty map is itself a leaf, so the mask
 * becomes `netFlow` and the server replaces the whole map — every account's
 * balance lost. Deltas cancelling to zero is routine (a same-account transfer,
 * a zero amount, an edit that touches only the title, a holding teardown whose
 * legs net out), and this wiped the rollup on 2026-08-01.
 */
export function planEffect(ledgerId: string, effect: LedgerEffect): WritePlan {
  const ops: WriteOp[] = [];
  const accounts = Object.keys(effect.balanceDeltas).filter(
    (a) => effect.balanceDeltas[a] !== 0,
  );
  if (accounts.length > 0) {
    const netFlow: PlanData = {};
    for (const account of accounts) netFlow[account] = incrementBy(effect.balanceDeltas[account]);
    ops.push({ kind: "set", path: balanceRollupPath(ledgerId), data: { netFlow }, merge: true });
  }
  for (const [yearMonth, c] of effect.monthContributions) {
    ops.push({
      kind: "set",
      path: monthRollupPath(ledgerId, yearMonth),
      data: monthRollupData(yearMonth, c),
      merge: true,
    });
  }
  return { ops };
}

// ── Financial Event writes ────────────────────────────────────────────────────

/** The stored document body for a new Financial Event. Written out field by
 *  field so an unexpected caller property can never reach storage. */
function eventDocData(input: NewTransactionInput): PlanData {
  return {
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    toAmount: input.toAmount ?? input.amount,
    baseAmount: input.baseAmount,
    baseCurrency: input.baseCurrency,
    fxRate: input.fxRate,
    date: atTime(input.date),
    yearMonth: yearMonthOf(input.date),
    categoryId: input.categoryId,
    projectId: input.projectId,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    title: input.title,
    note: input.note,
    createdBy: input.createdBy,
    createdAt: serverTime(),
    updatedAt: serverTime(),
    deletedAt: null,
  };
}

/** The projection view of a new event — its yearMonth comes from `date`. */
export function projected(input: NewTransactionInput): EventProjectionFields {
  return {
    type: input.type,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    toAmount: input.toAmount ?? input.amount,
    baseAmount: input.baseAmount,
    categoryId: input.categoryId,
    projectId: input.projectId,
    yearMonth: yearMonthOf(input.date),
  };
}

/** Record a Financial Event and move the projections. */
export function planAddEvent(
  ledgerId: string,
  txId: string,
  input: NewTransactionInput,
): WritePlan {
  return concatPlans(
    { ops: [{ kind: "set", path: transactionPath(ledgerId, txId), data: eventDocData(input) }] },
    planEffect(ledgerId, ledgerEffect(null, projected(input))),
  );
}

/** The field updates an edit writes to the event document itself. */
function patchDocData(patch: Partial<NewTransactionInput>): PlanData {
  const { date, ...rest } = patch;
  const data: PlanData = { updatedAt: serverTime() };
  // Skip explicitly-undefined keys: Firestore rejects an undefined value, and a
  // Partial can legitimately carry one.
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) data[key] = value as PlanValue;
  }
  if (date) {
    data.date = atTime(date);
    data.yearMonth = yearMonthOf(date);
  }
  return data;
}

/**
 * Edit in place (loose model): rewrite the changed fields, reverse the old
 * effect and apply the new one.
 *
 * A soft-deleted event contributes nothing to the projections, so editing one
 * only rewrites its fields — `planRestoreEvent` applies the corrected effect
 * later. Applying the edit without reversing anything, as the repo did before
 * this module, left the rollups counting a deleted event.
 */
export function planUpdateEvent(
  ledgerId: string,
  txId: string,
  old: StoredEventFields,
  patch: Partial<NewTransactionInput>,
  { deleted }: { deleted: boolean },
): WritePlan {
  const after = mergedEvent(old, {
    ...patch,
    yearMonth: patch.date ? yearMonthOf(patch.date) : undefined,
  });
  const effect = deleted ? ledgerEffect(null, null) : ledgerEffect(storedEvent(old), after);
  return concatPlans(
    {
      ops: [
        { kind: "update", path: transactionPath(ledgerId, txId), data: patchDocData(patch) },
      ],
    },
    planEffect(ledgerId, effect),
  );
}

/** Soft delete (ADR-0004): mark deleted and reverse its effect. */
export function planSoftDeleteEvent(
  ledgerId: string,
  txId: string,
  old: StoredEventFields,
): WritePlan {
  return concatPlans(
    {
      ops: [
        {
          kind: "update",
          path: transactionPath(ledgerId, txId),
          data: { deletedAt: serverTime(), updatedAt: serverTime() },
        },
      ],
    },
    planEffect(ledgerId, ledgerEffect(storedEvent(old), null)),
  );
}

/** Undo a soft delete and re-apply its effect. */
export function planRestoreEvent(
  ledgerId: string,
  txId: string,
  old: StoredEventFields,
): WritePlan {
  return concatPlans(
    {
      ops: [
        {
          kind: "update",
          path: transactionPath(ledgerId, txId),
          data: { deletedAt: null, updatedAt: serverTime() },
        },
      ],
    },
    planEffect(ledgerId, ledgerEffect(null, storedEvent(old))),
  );
}

/**
 * Turn auto-assignment on or off for one Project, keeping the Ledger-wide
 * invariant that **at most one Project is auto-assigning at a time**.
 *
 * `projectId` is single-valued on a Financial Event, so two Projects stamping
 * at once would force the app to guess which one a purchase belongs to — and a
 * wrong guess there is silent. Switching is therefore a decision the owner
 * makes once, expressed here as one atomic plan: the newly chosen Project is
 * turned on in the same write that turns the previous one off.
 *
 * Turning auto-assign *off* touches only the named Project.
 */
export function planSetAutoAssign(
  ledgerId: string,
  projects: readonly { id: string; autoAssign: boolean }[],
  projectId: string,
  on: boolean,
): WritePlan {
  const ops: WriteOp[] = [];
  if (on) {
    for (const p of projects)
      if (p.id !== projectId && p.autoAssign)
        ops.push({
          kind: "update",
          path: projectPath(ledgerId, p.id),
          data: { autoAssign: false, updatedAt: serverTime() },
        });
  }
  ops.push({
    kind: "update",
    path: projectPath(ledgerId, projectId),
    data: { autoAssign: on, updatedAt: serverTime() },
  });
  return { ops };
}

// ── Holding writes ────────────────────────────────────────────────────────────

/**
 * The transfer that moves cash for a trade: a buy debits the cash account into
 * the holding; a sell moves the proceeds from the holding back to cash. The
 * holding's id stands in as a (non-listed) transfer endpoint, so its balance
 * never double-counts against the cash accounts on the Assets page.
 */
export function tradeTransfer(
  kind: TradeKind,
  holding: Pick<Holding, "id" | "ticker" | "currency">,
  input: TradeInput,
  uid: string,
): NewTransactionInput {
  const cashAccountId = input.cashAccountId as string;
  return {
    type: "transfer",
    amount: input.amount,
    currency: holding.currency,
    baseAmount: input.amount,
    baseCurrency: holding.currency,
    fxRate: 1,
    date: input.date,
    categoryId: null,
    // A trade's cash leg is a transfer: it contributes to no total, and it
    // belongs to no episode of spending.
    projectId: null,
    accountId: kind === "buy" ? cashAccountId : holding.id,
    toAccountId: kind === "buy" ? holding.id : cashAccountId,
    title: holding.ticker,
    note: null,
    createdBy: uid,
  };
}

function tradeDocData(kind: TradeKind, input: TradeInput, realized: number): PlanData {
  return {
    kind,
    date: atTime(input.date),
    shares: input.shares,
    price: input.price,
    amount: input.amount,
    realized,
    createdAt: serverTime(),
  };
}

/** The cash leg of a trade, when there is one. */
function planTradeCashLeg(
  ledgerId: string,
  kind: TradeKind,
  holding: Pick<Holding, "id" | "ticker" | "currency">,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): WritePlan {
  if (!input.cashAccountId || !ids.transferId) return { ops: [] };
  return planAddEvent(ledgerId, ids.transferId, tradeTransfer(kind, holding, input, uid));
}

/**
 * Add a holding: its cost/shares/price are the opening position, recorded as
 * the first `buy` trade. With a funding account, the opening buy also debits
 * that cash account — atomically, in the same plan.
 */
export function planAddHolding(
  ledgerId: string,
  holdingId: string,
  input: NewHolding,
  uid: string,
  ids: TradeIds,
): WritePlan {
  const { buyDate, fundingAccountId, ...rest } = input;
  const date = buyDate ?? new Date();
  const openingBuy: TradeInput = {
    shares: rest.shares,
    price: rest.price,
    amount: rest.cost,
    date,
    cashAccountId: fundingAccountId,
  };
  return concatPlans(
    {
      ops: [
        {
          kind: "set",
          path: holdingPath(ledgerId, holdingId),
          data: {
            ticker: rest.ticker,
            name: rest.name,
            class: rest.class,
            currency: rest.currency,
            cost: rest.cost,
            shares: rest.shares,
            price: rest.price,
            targetPrice: rest.targetPrice,
            dividendPerShare: rest.dividendPerShare,
            realizedGain: 0,
            dividendReceived: 0,
            buyDate: buyDate ? atTime(buyDate) : null,
            pricedAt: serverTime(),
            archived: false,
            sortOrder: Date.now(),
          },
        },
        {
          kind: "set",
          path: tradePath(ledgerId, holdingId, ids.tradeId),
          data: tradeDocData("buy", openingBuy, 0),
        },
      ],
    },
    planTradeCashLeg(
      ledgerId,
      "buy",
      { id: holdingId, ticker: rest.ticker, currency: rest.currency },
      openingBuy,
      uid,
      ids,
    ),
  );
}

/** Buy more of a holding (average-cost): shares in, cash paid folded into the
 *  cost basis, with an optional cash leg. */
export function planBuy(
  ledgerId: string,
  holding: Holding,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): WritePlan {
  return concatPlans(
    {
      ops: [
        {
          kind: "update",
          path: holdingPath(ledgerId, holding.id),
          data: {
            shares: incrementBy(input.shares),
            cost: incrementBy(input.amount),
            price: input.price,
            pricedAt: atTime(input.date),
          },
        },
        {
          kind: "set",
          path: tradePath(ledgerId, holding.id, ids.tradeId),
          data: tradeDocData("buy", input, 0),
        },
      ],
    },
    planTradeCashLeg(ledgerId, "buy", holding, input, uid, ids),
  );
}

/** Sell part or all of a holding (average-cost): removes shares at the average
 *  cost, banks the realized gain, and moves proceeds to cash (optional leg). */
export function planSell(
  ledgerId: string,
  holding: Holding,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): WritePlan {
  const r = applySell({ shares: holding.shares, cost: holding.cost }, input.shares, input.amount);
  return concatPlans(
    {
      ops: [
        {
          kind: "update",
          path: holdingPath(ledgerId, holding.id),
          data: {
            shares: incrementBy(-input.shares),
            cost: incrementBy(-r.costRemoved),
            realizedGain: incrementBy(r.realized),
            price: input.price,
            pricedAt: atTime(input.date),
          },
        },
        {
          kind: "set",
          path: tradePath(ledgerId, holding.id, ids.tradeId),
          data: tradeDocData("sell", input, r.realized),
        },
      ],
    },
    planTradeCashLeg(ledgerId, "sell", holding, input, uid, ids),
  );
}

/** One of a holding's paired cash transfers, as read back from storage. */
export interface HoldingCashLeg {
  txId: string;
  event: StoredEventFields;
}

/**
 * Delete a holding entirely: soft-delete every paired cash transfer (undoing
 * their effect on the funding accounts), then hard-delete the holding document
 * and its trades. The projections are reversed once, combined across all legs,
 * so legs that net to zero correctly write nothing.
 *
 * The caller supplies the legs and trade ids it read; duplicates must already
 * be removed (a leg whose two endpoints are both this holding comes back from
 * two queries, and reversing it twice would corrupt the rollup by its own
 * amount).
 */
export function planRemoveHolding(
  ledgerId: string,
  holdingId: string,
  legs: readonly HoldingCashLeg[],
  tradeIds: readonly string[],
): WritePlan {
  return concatPlans(
    {
      ops: legs.map((leg) => ({
        kind: "update" as const,
        path: transactionPath(ledgerId, leg.txId),
        data: { deletedAt: serverTime(), updatedAt: serverTime() },
      })),
    },
    planEffect(
      ledgerId,
      combineEffects(legs.map((leg) => ledgerEffect(storedEvent(leg.event), null))),
    ),
    {
      ops: [
        ...tradeIds.map((id) => ({
          kind: "delete" as const,
          path: tradePath(ledgerId, holdingId, id),
        })),
        { kind: "delete" as const, path: holdingPath(ledgerId, holdingId) },
      ],
    },
  );
}

/**
 * Record a valuation snapshot for a date: writes only the holdings in
 * `entries` (a partial update — e.g. just the USD holdings), refreshes their
 * denormalized price/shares/pricedAt, and updates current FX.
 *
 * The snapshot document is merged, so updating a second currency group on the
 * same date accumulates into one `snapshots/{date}` doc rather than
 * overwriting it. Untouched holdings keep their previous pricedAt.
 */
export function planSnapshot(
  ledgerId: string,
  snap: { date: string; entries: Record<string, SnapshotEntry>; fx: Record<string, number> },
  pricedAt: Date,
): WritePlan {
  const entries: PlanData = {};
  for (const [holdingId, e] of Object.entries(snap.entries)) {
    entries[holdingId] = { price: e.price, shares: e.shares };
  }
  return {
    ops: [
      {
        kind: "set",
        path: snapshotPath(ledgerId, snap.date),
        data: { date: snap.date, entries, fx: snap.fx },
        merge: true,
      },
      ...Object.entries(snap.entries).map(([holdingId, e]) => ({
        kind: "update" as const,
        path: holdingPath(ledgerId, holdingId),
        data: { price: e.price, shares: e.shares, pricedAt: atTime(pricedAt) },
      })),
      { kind: "set", path: fxPath(ledgerId), data: { rates: snap.fx }, merge: true },
    ],
  };
}
