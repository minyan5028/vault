/**
 * Vault domain types. Kept free of Firebase/Firestore concerns — the data layer
 * maps these to/from persistence. Mirrors docs/DATA_MODEL.md.
 */

export type LedgerRole = "owner" | "member";

export interface Ledger {
  id: string;
  name: string;
  baseCurrency: string;
  members: Record<string, LedgerRole>;
  createdBy: string;
  createdAt: Date;
}

export interface Account {
  id: string;
  name: string;
  /** Free-form label, not a fixed cash/bank/credit enum. */
  type: string;
  currency: string;
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

/** A Financial Event. All money fields are integer minor units (×100). */
export interface Transaction {
  id: string;
  type: EventType;
  amount: number;
  currency: string;
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
