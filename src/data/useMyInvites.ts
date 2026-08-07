import type { Ledger } from "../domain/types";
import { ledgerRepo } from "./ledgerRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: Ledger[] = [];

/** Live list of ledgers the signed-in user has been invited to (by email). */
export function useMyInvites(email: string | null): Ledger[] {
  const key = email ?? "";
  return useLiveQuery(key, NONE, (emit) => ledgerRepo.subscribeInvites(key, emit));
}
