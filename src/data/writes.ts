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
import { fromDateInputValue, toDateInputValue, yearMonthOf } from "../lib/date";
import { openingBuyDate, replayTrades, type ReplayedPosition } from "../lib/holdings";
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
  type Trade,
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
 *
 * **The invariant is per-write, not global.** This plan is decided from the
 * caller's snapshot and committed as a batch, not a read-modify-write
 * transaction, so two members of a shared Ledger switching at the same moment
 * can both succeed; so can restoring a backup taken while a different Project
 * was stamping. `stampingProject` therefore resolves the list deterministically
 * rather than assuming exactly one qualifies. Making this globally atomic means
 * a Firestore transaction over the whole collection — worth it only if two
 * stamping Projects is ever observed.
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

/**
 * The transfer this trade moves money through, or null when it moves none.
 *
 * An id is allocated up front by the caller, before it is known whether the
 * trade wants a cash leg, so `ids.transferId` alone does not mean there is one
 * — the cash account is what decides. Both this and `planTradeCashLeg` ask the
 * same question, and must keep agreeing: a trade naming a transfer that was
 * never written could not be edited without inventing one.
 */
function cashLegId(input: TradeInput, ids: TradeIds): string | null {
  return input.cashAccountId && ids.transferId ? ids.transferId : null;
}

/**
 * The stored document body for a trade.
 *
 * `transferId` is written even when null: absent means a legacy trade whose leg
 * cannot be attributed, which is a third state the edit path has to tell apart
 * from "deliberately no cash leg" (ADR-0010).
 */
function tradeDocData(
  kind: TradeKind,
  input: TradeInput,
  realized: number,
  transferId: string | null,
): PlanData {
  return {
    kind,
    date: atTime(input.date),
    shares: input.shares,
    price: input.price,
    amount: input.amount,
    realized,
    transferId,
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
  // With no date entered, the holding and its opening trade both take today —
  // at local midnight, like every other trade date, so `replayOrder` stays
  // stable for same-day trades. They must agree: `buyDate` is a cache of the
  // opening trade now, and leaving the holding's copy null would let the next
  // trade write stamp an arbitrary creation instant onto it.
  const date = buyDate ?? fromDateInputValue(toDateInputValue(new Date()));
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
            buyDate: atTime(date),
            pricedAt: serverTime(),
            archived: false,
            sortOrder: Date.now(),
          },
        },
        {
          kind: "set",
          path: tradePath(ledgerId, holdingId, ids.tradeId),
          data: tradeDocData("buy", openingBuy, 0, cashLegId(openingBuy, ids)),
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

// ── Trade writes ──────────────────────────────────────────────────────────────

/** The fields of a trade a correction may change. Not the cash account: moving
 *  a trade to a different account means deleting it and recording it again. */
export interface TradeEdit {
  date?: Date;
  shares?: number;
  price?: number;
  amount?: number;
}

/**
 * A trade write either adds up or it is refused.
 *
 * Average cost is path-dependent, so a correction reaches forward: deleting an
 * early buy can leave a later sell selling shares that were never bought.
 * Refusing names the trade the replay broke on and by how much, so the owner is
 * told which trade to fix first. Clamping instead would invent money.
 */
export type TradeWriteResult =
  | { ok: true; plan: WritePlan }
  | { ok: false; blockedBy: Trade; remaining: number };

/**
 * What a trade write needs beyond the trade itself.
 *
 * `trades` is the holding's stored log — including the trade being edited or
 * deleted, excluding one being added. The caller already has it (the detail
 * screen subscribes to it), so folding costs no extra read.
 */
export interface TradeContext {
  trades: readonly Trade[];
  /**
   * Date of the most recent snapshot **that priced this holding**, or null if it
   * has never been in one.
   *
   * Not the ledger's newest snapshot: snapshots are recorded per currency group
   * (`UpdatePricesForm`), and `planSnapshot` only touches the holdings it names,
   * so a USD reading says nothing about a TWD holding. Using the ledger-wide
   * date would treat a TWD buy as already counted by a snapshot that never
   * looked at it, and the shares would go missing from net worth.
   */
  latestSnapshot: Date | null;
}

/**
 * What a trade contributes to *held* shares.
 *
 * Snapshots own held shares and supersede every estimate before them
 * (ADR-0010), so a trade dated on or before the latest snapshot contributes
 * nothing — the broker's own reading has already counted it, and adding the
 * trade's shares again would double-count. Only a trade after the last snapshot
 * has to stand in for a reading that has not happened yet.
 *
 * On the snapshot's own date the reading wins: a snapshot is an end-of-day
 * position, so it already includes that day's trading.
 */
function heldSharesContribution(
  t: Pick<Trade, "kind" | "shares" | "date"> | null,
  latestSnapshot: Date | null,
): number {
  if (!t) return 0;
  if (latestSnapshot && t.date.getTime() <= latestSnapshot.getTime()) return 0;
  return t.kind === "buy" ? t.shares : -t.shares;
}

/**
 * The holding update a fold decides.
 *
 * `cost` and `realizedGain` are written **absolute**, never incremented. They
 * are the fold's output (ADR-0010); incrementing would carry forward whatever
 * drift the stored figure already had, which is exactly how the log and the
 * aggregate came apart in the first place.
 *
 * `price` and `pricedAt` are deliberately absent: they belong to the valuation
 * axis, and correcting a two-year-old trade must not move today's price.
 *
 * `buyDate` is written here too — a cache of the earliest surviving buy, so the
 * date on the holding and the date in the log can never again disagree.
 *
 * `observed` carries the valuation fields a *new* trade also brings (its price,
 * on its day), folded into the same document write rather than a second one.
 */
function planFold(
  ledgerId: string,
  holdingId: string,
  log: readonly Trade[],
  fold: ReplayedPosition,
  sharesDelta: number,
  observed?: PlanData,
): WritePlan {
  const opened = openingBuyDate(log);
  const data: PlanData = {
    cost: fold.cost,
    realizedGain: fold.realizedGain,
    buyDate: opened ? atTime(opened) : null,
    ...observed,
  };
  if (sharesDelta !== 0) data.shares = incrementBy(sharesDelta);
  return { ops: [{ kind: "update", path: holdingPath(ledgerId, holdingId), data }] };
}

/**
 * Re-price the `realized` cached on each sell the fold moved.
 *
 * A sell's realized gain is a fold output, not an input — editing an earlier
 * buy re-prices every sell after it. Leaving the stored copies alone would make
 * the log disagree with the aggregate it is supposed to add up to.
 *
 * `skipId` is the trade whose document this plan already rewrites in full; its
 * realized figure travels in that write instead of a second one.
 */
function planRealizedRewrites(
  ledgerId: string,
  holdingId: string,
  log: readonly Trade[],
  fold: ReplayedPosition,
  skipId?: string,
): WritePlan {
  const ops: WriteOp[] = [];
  for (const t of log) {
    if (t.kind !== "sell" || t.deletedAt || t.id === skipId) continue;
    const now = fold.realizedByTrade.get(t.id) ?? 0;
    if (now !== t.realized)
      ops.push({
        kind: "update",
        path: tradePath(ledgerId, holdingId, t.id),
        data: { realized: now },
      });
  }
  return { ops };
}

/** The trade a buy or sell adds, as it will read back from the log. */
function addedTrade(kind: TradeKind, id: string, input: TradeInput): Trade {
  return {
    id,
    kind,
    date: input.date,
    shares: input.shares,
    price: input.price,
    amount: input.amount,
    realized: 0,
  };
}

/**
 * The price a new trade observed, when it is the most recent word on the
 * subject.
 *
 * A trade is a genuine observation of the market on the day it happened, so
 * recording one refreshes the displayed price. A **backdated** one must not:
 * recording a 2024 buy that was missed — now a sanctioned workflow — would
 * otherwise drag the holding's price back to 2024 and collapse its market value
 * until the next snapshot.
 */
function observedPrice(input: TradeInput, pricedAt: Date | null): PlanData | undefined {
  if (pricedAt && input.date.getTime() <= pricedAt.getTime()) return undefined;
  return { price: input.price, pricedAt: atTime(input.date) };
}

/** Record a trade and re-fold the holding it belongs to. */
function planAddTrade(
  ledgerId: string,
  kind: TradeKind,
  holding: Pick<Holding, "id" | "ticker" | "currency" | "pricedAt">,
  ctx: TradeContext,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): TradeWriteResult {
  const added = addedTrade(kind, ids.tradeId, input);
  const log = [...ctx.trades, added];
  const fold = replayTrades(log);
  if (!fold.ok) return fold;

  const realized = fold.realizedByTrade.get(added.id) ?? 0;
  return {
    ok: true,
    plan: concatPlans(
      planFold(
        ledgerId,
        holding.id,
        log,
        fold,
        heldSharesContribution(added, ctx.latestSnapshot),
        observedPrice(input, holding.pricedAt),
      ),
      {
        ops: [
          {
            kind: "set",
            path: tradePath(ledgerId, holding.id, ids.tradeId),
            data: tradeDocData(kind, input, realized, cashLegId(input, ids)),
          },
        ],
      },
      planRealizedRewrites(ledgerId, holding.id, log, fold, added.id),
      planTradeCashLeg(ledgerId, kind, holding, input, uid, ids),
    ),
  };
}

/** Buy more of a holding: shares in, cash paid folded into the cost basis, with
 *  an optional cash leg. */
export function planBuy(
  ledgerId: string,
  holding: Pick<Holding, "id" | "ticker" | "currency" | "pricedAt">,
  ctx: TradeContext,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): TradeWriteResult {
  return planAddTrade(ledgerId, "buy", holding, ctx, input, uid, ids);
}

/** Sell part or all of a holding: the fold removes the shares at the average
 *  cost of the moment and banks the realized gain. */
export function planSell(
  ledgerId: string,
  holding: Pick<Holding, "id" | "ticker" | "currency" | "pricedAt">,
  ctx: TradeContext,
  input: TradeInput,
  uid: string,
  ids: TradeIds,
): TradeWriteResult {
  return planAddTrade(ledgerId, "sell", holding, ctx, input, uid, ids);
}

/** The field updates a correction writes to the trade document itself. */
function tradePatchData(patch: TradeEdit, realized: number): PlanData {
  const data: PlanData = { realized, updatedAt: serverTime() };
  if (patch.date) data.date = atTime(patch.date);
  if (patch.shares !== undefined) data.shares = patch.shares;
  if (patch.price !== undefined) data.price = patch.price;
  if (patch.amount !== undefined) data.amount = patch.amount;
  return data;
}

/**
 * The cash leg's own correction, when the trade has one.
 *
 * Only the money and the date can move — a trade's cash account is not
 * editable — and the leg is single-currency at rate 1, so `amount`, `toAmount`
 * and `baseAmount` are the same figure. A trade whose link is unknown (a legacy
 * trade, see the `Trade` type) simply moves no money: the alternative is
 * guessing which transfer to touch.
 */
function planLegCorrection(
  ledgerId: string,
  leg: HoldingCashLeg | null,
  patch: TradeEdit,
): WritePlan {
  if (!leg) return { ops: [] };
  const legPatch: Partial<NewTransactionInput> = {};
  if (patch.amount !== undefined) {
    legPatch.amount = patch.amount;
    legPatch.toAmount = patch.amount;
    legPatch.baseAmount = patch.amount;
  }
  if (patch.date) legPatch.date = patch.date;
  if (Object.keys(legPatch).length === 0) return { ops: [] };
  return planUpdateEvent(ledgerId, leg.txId, leg.event, legPatch, { deleted: false });
}

/**
 * Correct a trade in place (ADR-0005's loose model, which trades never
 * honoured): rewrite the changed fields, re-fold the holding from the surviving
 * log, and move the cash leg with it.
 *
 * The share delta obeys the dated rule — a trade after the latest snapshot
 * stands in for a reading that has not happened, one before it has already been
 * superseded. A correction that moves a trade across that boundary therefore
 * takes its contribution with it.
 */
export function planEditTrade(
  ledgerId: string,
  holdingId: string,
  ctx: TradeContext,
  tradeId: string,
  patch: TradeEdit,
  leg: HoldingCashLeg | null,
): TradeWriteResult {
  const before = ctx.trades.find((t) => t.id === tradeId);
  if (!before) throw new Error(`trade ${tradeId} is not in the log`);
  const after: Trade = { ...before, ...patch };
  const log = ctx.trades.map((t) => (t.id === tradeId ? after : t));
  const fold = replayTrades(log);
  if (!fold.ok) return fold;

  const delta =
    heldSharesContribution(after.deletedAt ? null : after, ctx.latestSnapshot) -
    heldSharesContribution(before.deletedAt ? null : before, ctx.latestSnapshot);

  return {
    ok: true,
    plan: concatPlans(
      planFold(ledgerId, holdingId, log, fold, delta),
      {
        ops: [
          {
            kind: "update",
            path: tradePath(ledgerId, holdingId, tradeId),
            data: tradePatchData(patch, fold.realizedByTrade.get(tradeId) ?? 0),
          },
        ],
      },
      planRealizedRewrites(ledgerId, holdingId, log, fold, tradeId),
      planLegCorrection(ledgerId, leg, patch),
    ),
  };
}

/**
 * Soft-delete one trade (ADR-0004): drop it from the fold, reverse its cash
 * leg, and give back whatever it was contributing to held shares.
 *
 * Soft, because a trade is a Financial Event and ADR-0004 already decided that
 * those are never physically deleted — the trade path simply never caught up.
 */
export function planDeleteTrade(
  ledgerId: string,
  holdingId: string,
  ctx: TradeContext,
  tradeId: string,
  leg: HoldingCashLeg | null,
): TradeWriteResult {
  const before = ctx.trades.find((t) => t.id === tradeId);
  if (!before) throw new Error(`trade ${tradeId} is not in the log`);
  const log = ctx.trades.filter((t) => t.id !== tradeId);
  const fold = replayTrades(log);
  if (!fold.ok) return fold;

  const delta = -heldSharesContribution(before.deletedAt ? null : before, ctx.latestSnapshot);

  return {
    ok: true,
    plan: concatPlans(
      planFold(ledgerId, holdingId, log, fold, delta),
      {
        ops: [
          {
            kind: "update",
            path: tradePath(ledgerId, holdingId, tradeId),
            data: { deletedAt: serverTime(), updatedAt: serverTime() },
          },
        ],
      },
      planRealizedRewrites(ledgerId, holdingId, log, fold),
      leg ? planSoftDeleteEvent(ledgerId, leg.txId, leg.event) : { ops: [] },
    ),
  };
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
