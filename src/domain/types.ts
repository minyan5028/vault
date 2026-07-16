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
 * Per-month aggregate for a ledger, maintained on every write (see
 * `transactionRepo`) so Stats/trends read a few small docs instead of every
 * transaction. Stored at `ledgers/{id}/rollups/{yearMonth}`. Transfers are
 * excluded (they move money between accounts, not income/expense). All money
 * fields are integer minor units (×100); category maps key on categoryId, or
 * `UNCATEGORIZED` when null.
 */
export interface MonthlyRollup {
  yearMonth: string;
  income: number;
  expense: number;
  expenseByCategory: Record<string, number>;
  incomeByCategory: Record<string, number>;
}

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
  accountId: string;
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
 * One recorded buy or sell against a holding, kept as an append-only log at
 * `ledgers/{id}/holdings/{hid}/trades/{tid}` for faithful history. The running
 * shares/cost/realizedGain on the Holding are the aggregate of these.
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
