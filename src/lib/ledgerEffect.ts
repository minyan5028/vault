/**
 * What one Financial Event does to the Ledger's projections.
 *
 * The projections are the per-account balance rollup (`meta/balances.netFlow`)
 * and the per-month rollups (`rollups/{yearMonth}`). Both are derived data
 * (ADR-0005: the Financial Event is the source of truth), maintained by atomic
 * increments on every write rather than recomputed.
 *
 * Every write — create, edit, soft-delete, restore, and each cash leg of a
 * holding teardown — is the same question asked twice: what did the event look
 * like *before*, and what does it look like *after*? `ledgerEffect` answers it
 * once, as a plain value, so the rules live here instead of being re-composed
 * at each call site in the repos (which is where every rollup bug so far has
 * come from).
 *
 * Pure and free of Firestore: `transactionRepo` turns the returned value into
 * `increment()` payloads, and its tests can assert the value directly.
 */
import { accountDeltas, pruneZeroDeltas } from "./balance";
import { addContribution, monthContribution, type RollupContribution } from "./rollup";
import type { EventType } from "../domain/types";

/**
 * The fields of a Financial Event that drive the projections — deliberately
 * narrower than `Transaction`, so both a domain object and a raw Firestore doc
 * can be passed without casting.
 */
export interface EventProjectionFields {
  type: EventType;
  accountId: string;
  toAccountId: string | null;
  /** Minor units debited/credited on `accountId`, in that account's currency. */
  amount: number;
  /** Minor units credited to `toAccountId` (differs only on a cross-currency
   *  transfer). Defaults to `amount`. */
  toAmount?: number;
  /** TWD snapshot locked at entry (ADR-0002) — drives the month rollups only. */
  baseAmount: number;
  categoryId: string | null;
  yearMonth: string;
}

/**
 * A complete, already-pruned description of how the projections must move.
 *
 * Both collections are pruned to what actually changes, so an empty
 * `balanceDeltas` or `monthContributions` means "write nothing" rather than
 * "write an empty value" — the distinction that wiped the balance rollup on
 * 2026-08-01 (see `pruneZeroDeltas`, and `rollupDelta` in transactionRepo for
 * why Firestore treats an empty map as a whole-field overwrite).
 */
export interface LedgerEffect {
  /** accountId → signed minor units. Never contains a zero. */
  balanceDeltas: Record<string, number>;
  /** yearMonth → signed contribution. Never contains an all-zero entry. */
  monthContributions: Map<string, RollupContribution>;
}

/** True when nothing at all needs writing — no balance moved, no month changed. */
export function isEmptyEffect(effect: LedgerEffect): boolean {
  return (
    Object.keys(effect.balanceDeltas).length === 0 && effect.monthContributions.size === 0
  );
}

function mergeDeltas(into: Record<string, number>, from: Record<string, number>): void {
  for (const [account, v] of Object.entries(from)) into[account] = (into[account] ?? 0) + v;
}

function isZeroContribution(c: RollupContribution): boolean {
  return (
    c.income === 0 &&
    c.expense === 0 &&
    Object.values(c.expenseByCategory).every((v) => v === 0) &&
    Object.values(c.incomeByCategory).every((v) => v === 0)
  );
}

/** Drop months whose contribution cancels out entirely — an increment of zero
 *  is a wasted write, and reversing an edit within the same month is routine. */
function pruneZeroContributions(
  months: Map<string, RollupContribution>,
): Map<string, RollupContribution> {
  const out = new Map<string, RollupContribution>();
  for (const [ym, c] of months) if (!isZeroContribution(c)) out.set(ym, c);
  return out;
}

/**
 * The projection movement from `before` to `after`. Pass `null` for either
 * side to express the whole range of writes with one interface:
 *
 *  - create / restore  → `ledgerEffect(null, event)`
 *  - soft-delete       → `ledgerEffect(event, null)`
 *  - edit              → `ledgerEffect(oldEvent, newEvent)`
 *
 * On an edit whose date crosses a month boundary, the two months land as two
 * separate contributions (reverse the old, apply the new); within one month
 * they net, and cancel to nothing when the edit touched neither amount nor
 * category. Passing `null` for a soft-deleted event's `before` is how a caller
 * says "its effect was already reversed" — see `transactionRepo.update`.
 */
export function ledgerEffect(
  before: EventProjectionFields | null,
  after: EventProjectionFields | null,
): LedgerEffect {
  const deltas: Record<string, number> = {};
  const months = new Map<string, RollupContribution>();

  if (before) {
    mergeDeltas(deltas, accountDeltas(before, -1));
    addContribution(months, before.yearMonth, monthContribution(before, -1));
  }
  if (after) {
    mergeDeltas(deltas, accountDeltas(after, 1));
    addContribution(months, after.yearMonth, monthContribution(after, 1));
  }

  return {
    balanceDeltas: pruneZeroDeltas(deltas),
    monthContributions: pruneZeroContributions(months),
  };
}

/**
 * Sum several effects into one, so a multi-event operation commits a single
 * rollup write instead of one per event. Used by the holding teardown, which
 * reverses every paired cash leg at once (legs that net to zero across the set
 * then correctly write nothing).
 */
export function combineEffects(effects: readonly LedgerEffect[]): LedgerEffect {
  const deltas: Record<string, number> = {};
  const months = new Map<string, RollupContribution>();
  for (const e of effects) {
    mergeDeltas(deltas, e.balanceDeltas);
    for (const [ym, c] of e.monthContributions) addContribution(months, ym, c);
  }
  return {
    balanceDeltas: pruneZeroDeltas(deltas),
    monthContributions: pruneZeroContributions(months),
  };
}

/** The subset of an edit patch that can move the projections. */
export type EventPatch = Partial<
  Pick<
    EventProjectionFields,
    "type" | "accountId" | "toAccountId" | "amount" | "toAmount" | "baseAmount" | "categoryId"
  >
> & {
  /** A new event date; the caller derives its yearMonth and passes it here. */
  yearMonth?: string;
  /** Used to re-derive `baseAmount` when the patch doesn't carry one. */
  fxRate?: number;
};

/** The stored shape an edit is applied over — a raw Firestore doc is accepted
 *  as-is, hence the tolerant optional fields. */
export interface StoredEventFields {
  type: EventType;
  accountId: string;
  toAccountId?: string | null;
  amount: number;
  toAmount?: number;
  baseAmount?: number;
  fxRate?: number;
  categoryId?: string | null;
  yearMonth: string;
}

/**
 * Apply an edit patch over the stored event to get the event as it will be.
 *
 * Two rules that an edit must respect live here rather than at the call site:
 *
 *  - `baseAmount` is re-derived from `amount × fxRate` unless the patch states
 *    it explicitly. Trusting the stored `baseAmount` let an amount-only edit
 *    leave the month rollups showing the old figure.
 *  - `toAccountId` / `categoryId` distinguish "absent from the patch" (keep the
 *    stored value) from an explicit `null` (clear it), which `??` cannot.
 */
export function mergedEvent(
  old: StoredEventFields,
  patch: EventPatch = {},
): EventProjectionFields {
  const amount = patch.amount ?? old.amount;
  const fxRate = patch.fxRate ?? old.fxRate ?? 1;
  return {
    type: patch.type ?? old.type,
    accountId: patch.accountId ?? old.accountId,
    toAccountId: patch.toAccountId !== undefined ? patch.toAccountId : (old.toAccountId ?? null),
    amount,
    toAmount: patch.toAmount !== undefined ? patch.toAmount : (old.toAmount ?? old.amount),
    baseAmount: patch.baseAmount ?? Math.round(amount * fxRate),
    categoryId: patch.categoryId !== undefined ? patch.categoryId : (old.categoryId ?? null),
    yearMonth: patch.yearMonth ?? old.yearMonth,
  };
}

/** Read the projection-relevant fields off a stored event unchanged — the
 *  `before` side of a delete, restore, or edit. */
export function storedEvent(old: StoredEventFields): EventProjectionFields {
  return {
    type: old.type,
    accountId: old.accountId,
    toAccountId: old.toAccountId ?? null,
    amount: old.amount,
    toAmount: old.toAmount ?? old.amount,
    baseAmount: old.baseAmount ?? 0,
    categoryId: old.categoryId ?? null,
    yearMonth: old.yearMonth,
  };
}
