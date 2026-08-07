import type { Ledger } from "../domain/types";
import { ledgerRepo } from "./ledgerRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: Ledger[] = [];

/** Live list of ledgers the signed-in user belongs to. */
export function useUserLedgers(uid: string): Ledger[] {
  return useLiveQuery(uid, NONE, (emit) => ledgerRepo.subscribeMine(uid, emit));
}
