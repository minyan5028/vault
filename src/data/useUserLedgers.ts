import { useEffect, useState } from "react";
import type { Ledger } from "../domain/types";
import { ledgerRepo } from "./ledgerRepo";

/** Live list of ledgers the signed-in user belongs to. */
export function useUserLedgers(uid: string): Ledger[] {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  useEffect(() => {
    if (!uid) return;
    return ledgerRepo.subscribeMine(uid, setLedgers);
  }, [uid]);
  return ledgers;
}
