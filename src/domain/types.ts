/**
 * Vault domain types. Kept free of Firebase/Firestore concerns — the data layer
 * maps these to/from persistence. Mirrors docs/DATA_MODEL.md.
 */

export type LedgerRole = "owner" | "member";

/** A member's display info, stored on the Ledger so other members can attribute
 *  entries without reading each other's private `users/{uid}` docs. */
export interface MemberProfile {
  name: string;
  email: string;
}

export interface Ledger {
  id: string;
  name: string;
  baseCurrency: string;
  members: Record<string, LedgerRole>;
  /** uids of members — a queryable array mirror of `members` keys. */
  memberIds: string[];
  /** lowercased emails invited but not yet joined (see sharing). */
  invitedEmails: string[];
  /** uid → display name/email; each member self-registers their own entry. */
  memberProfiles: Record<string, MemberProfile>;
  createdBy: string;
  createdAt: Date;
}

export interface Account {
  id: string;
  name: string;
  /** Free-form label, not a fixed cash/bank/credit enum. */
  type: string;
  currency: string;
  /** Balance before recorded history began (minor units). Balance = this + net flow. */
  openingBalance: number;
  archived: boolean;
  sortOrder: number;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  type: CategoryKind;
  icon: string | null;
  parentId: string | null;
  archived: boolean;
  sortOrder: number;
}

/**
 * A bounded, non-daily episode of spending that spans several Categories — a
 * trip, a wedding, a renovation (SPEC.md, ADR-0009).
 *
 * The second classification axis: a Category says what kind of money a
 * Financial Event is, a Project says which episode it belonged to. A Project
 * holds no money — it is not an Account, has no balance, and never enters net
 * worth.
 *
 * Its lifecycle is derived rather than stored: see `lib/project.ts`. There is
 * no `archived` flag because `endDate` already does that work.
 */
export interface Project {
  id: string;
  name: string;
  startDate: Date;
  /** Mandatory. Extendable, never absent — a Project that cannot end is not a
   *  Project. Past this date the Project has ended and stamps nothing. */
  endDate: Date;
  /** Stamp new manual entries with this Project. At most one per Ledger, an
   *  invariant enforced in the write plan (`planSetAutoAssign`). */
  autoAssign: boolean;
  /** Soft delete (ADR-0004). Financial Events keep pointing at a deleted
   *  Project — history is not rewritten because the catalog changed. */
  deletedAt: Date | null;
}

/** Financial Event kind. Starts here; grows later (dividend, asset_buy, …). */
export type EventType = "expense" | "income" | "transfer";

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

/** A template that generates transactions on a schedule (see roadmap). */
export interface RecurringRule {
  id: string;
  type: EventType;
  amount: number;
  currency: string;
  baseAmount: number;
  baseCurrency: string;
  fxRate: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  title: string;
  note: string | null;
  frequency: RecurringFrequency;
  interval: number; // every N weeks/months
  startDate: Date;
  nextDate: Date; // next occurrence still to generate
  active: boolean;
}

/** Category-key used in rollups for transactions with no category. */
export const UNCATEGORIZED = "uncategorized";

/**
 * The breakdown maps a month's rollup carries, named once.
 *
 * Every place that folds contributions together — accumulating them, summing
 * months, deciding whether a change is worth writing, turning one into
 * Firestore increments — iterates this list instead of naming each map by
 * hand. Adding a dimension is therefore data rather than four more
 * hand-written loops, and the zero-check cannot silently miss one: an edit
 * that moves a Financial Event between Projects changes neither amount nor
 * category, and a missed map would make it look like no change at all.
 */
export const BREAKDOWNS = [
  "expenseByCategory",
  "incomeByCategory",
  "expenseByProject",
  "incomeByProject",
] as const;

export type Breakdown = (typeof BREAKDOWNS)[number];

/** One map per breakdown dimension: key → integer minor units (×100). */
export type Breakdowns = Record<Breakdown, Record<string, number>>;

/**
 * The signed contribution of one or more Financial Events to a month.
 *
 * Category maps key on categoryId, or `UNCATEGORIZED` when null. Project maps
 * are **sparse**: a Financial Event with no Project contributes no key at all,
 * so everyday spending is `expense − Σ expenseByProject` rather than a sentinel
 * entry duplicating the total (ADR-0009).
 */
export type RollupContribution = { income: number; expense: number } & Breakdowns;

/** An empty set of breakdown maps. */
export function emptyBreakdowns(): Breakdowns {
  return { expenseByCategory: {}, incomeByCategory: {}, expenseByProject: {}, incomeByProject: {} };
}

/**
 * Per-month aggregate for a ledger, maintained on every write (see
 * `transactionRepo`) so Stats/trends read a few small docs instead of every
 * transaction. Stored at `ledgers/{id}/rollups/{yearMonth}`. Transfers are
 * excluded (they move money between accounts, not income/expense). All money
 * fields are integer minor units (×100).
 */
export type MonthlyRollup = { yearMonth: string } & RollupContribution;

/** A Financial Event. All money fields are integer minor units (×100). */
export interface Transaction {
  id: string;
  type: EventType;
  amount: number;
  currency: string;
  /**
   * For a cross-currency transfer, the amount credited to `toAccountId` in the
   * destination account's own currency (minor units) — it differs from `amount`
   * (debited from `accountId` in its currency). For same-currency transfers and
   * all income/expense, this equals `amount`. Account balances use amount /
   * toAmount (each account in its own currency); `baseAmount` stays the TWD
   * snapshot for income/expense stats (ADR-0002).
   */
  toAmount: number;
  baseAmount: number;
  baseCurrency: string;
  fxRate: number;
  date: Date;
  yearMonth: string;
  categoryId: string | null;
  /**
   * The Project this event belongs to, or null for everyday spending — the
   * norm. The second classification axis: the category says what kind of money
   * this is, the project says which episode it belonged to (ADR-0009).
   */
  projectId: string | null;
  /**
   * The Ledger Endpoint the money moves from — usually an Account, but a
   * trade's cash leg names the Holding itself (see `tradeTransfer`), so the
   * position's value never double-counts against the cash accounts. Resolve it
   * through `lib/endpoints` rather than searching the account list.
   */
  accountId: string;
  /** The Ledger Endpoint the money moves to, for a transfer. See `accountId`. */
  toAccountId: string | null;
  title: string;
  note: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  source?: string | null;
}

/** How a holding earns, mirroring the user's own grow/dividend split. */
export type HoldingClass = "growth" | "dividend";

/**
 * A market-valued position (stock, forex, etc.) — an account whose worth is set
 * by the market, not derived from cash-flow events (see docs/DATA_MODEL.md).
 * Buy-and-hold with periodic snapshots; DRIP means `shares` grows over time.
 *
 * Money fields (`cost`, `price`) are ×100 integer minor units in `currency`.
 * `shares` is ×10000 (4 decimals) — DRIP produces fractional shares. Market
 * value = shares × price; qty×price may not reconcile to the cent (accepted).
 * `price`/`shares`/`pricedAt` denormalize the latest snapshot for quick display.
 */
export interface Holding {
  id: string;
  ticker: string;
  name: string | null;
  class: HoldingClass;
  currency: string;
  /** Cost basis of the shares currently held (×100), maintained on the
   *  average-cost method: a buy adds cash paid; a sell removes shares × the
   *  average cost per share. */
  cost: number;
  shares: number;
  price: number;
  pricedAt: Date | null;
  /** Cumulative realized gain from sells (×100, holding currency): for each
   *  sell, proceeds − (average cost × shares sold). Unaffected by price moves. */
  realizedGain: number;
  /** Cumulative dividends received (×100, holding currency). Reinvested (DRIP)
   *  so already reflected in `shares`/value — kept separately for reference
   *  only; NOT added to cost or net worth. A running total the user maintains. */
  dividendReceived: number;
  /** Expected annual dividend per share (×100, holding currency), user-entered.
   *  Reference only (drives current/forward yield); NOT part of net worth. */
  dividendPerShare: number;
  /** Optional price threshold that flags a holding for re-evaluation (×100). */
  targetPrice: number | null;
  /** When the position was first opened (the initial buy). */
  buyDate: Date | null;
  archived: boolean;
  sortOrder: number;
}

/** A buy or sell of a holding. */
export type TradeKind = "buy" | "sell";

/**
 * One recorded buy or sell against a holding, at
 * `ledgers/{id}/holdings/{hid}/trades/{tid}`.
 *
 * Trades own the event axis of a position (ADR-0010): the Holding's `cost` and
 * `realizedGain` are a fold over this log, and a trade is correctable and
 * soft-deletable like any other Financial Event. `shares` on the Holding is
 * not folded from here — that belongs to the snapshots.
 */
export interface Trade {
  id: string;
  kind: TradeKind;
  date: Date;
  /** Shares transacted (×10000). */
  shares: number;
  /** Per-share price (×100, holding currency). */
  price: number;
  /** Cash moved (×100): a buy's cost paid, a sell's proceeds received. */
  amount: number;
  /** Realized gain for a sell (×100); 0 for a buy. */
  realized: number;
  /**
   * The cash leg this trade moved money through — three distinct states:
   * a transaction id (the leg travels with the trade through edits and
   * deletes), `null` (recorded deliberately with no cash leg), or **absent**
   * (a legacy trade written before the link existed; a leg may well exist but
   * cannot be attributed to this trade — see `scripts/backfill_trade_legs.mjs`).
   */
  transferId?: string | null;
  /** True when this trade is soft-deleted (ADR-0004): excluded from the fold,
   *  its cash leg reversed with it. Absent on trades written before deletion
   *  existed, which is the same as not deleted. */
  deletedAt?: Date | null;
}

/** One valuation entry within a snapshot: a holding's price + share count then. */
export interface SnapshotEntry {
  price: number;
  shares: number;
}

/**
 * A portfolio valuation on one date (like a column in the user's spreadsheet):
 * every holding's price + shares, plus the FX rates used to value non-base
 * holdings into the base currency. Stored at `ledgers/{id}/snapshots/{date}`.
 * `fx` maps a currency to its rate into the ledger base currency (TWD).
 */
export interface PortfolioSnapshot {
  date: string;
  entries: Record<string, SnapshotEntry>;
  fx: Record<string, number>;
}
