import type { Transaction } from "../domain/types";
import { transactionRepo } from "./transactionRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: Transaction[] = [];

/** Live full history for one account (bounded to that account, not the ledger). */
export function useAccountTransactions(ledgerId: string, accountId: string): Transaction[] {
  return useLiveQuery(ledgerId && accountId ? `${ledgerId}|${accountId}` : "", NONE, (emit) =>
    transactionRepo.subscribeByAccount(ledgerId, accountId, emit),
  );
}
