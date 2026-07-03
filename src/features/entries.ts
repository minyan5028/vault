import type { EventType } from "../domain/types";

/**
 * A session entry — what Quick Entry produces and the Timeline shows. It's a
 * light subset of a Transaction, kept in memory until Firestore is wired up
 * (then this maps to the transactionRepo / DATA_MODEL shape).
 */
export interface SessionEntry {
  id: string;
  type: EventType;
  amount: number; // minor units (×100)
  currency: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  title: string;
  date: Date;
}
