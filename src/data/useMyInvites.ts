import { useEffect, useState } from "react";
import type { Ledger } from "../domain/types";
import { ledgerRepo } from "./ledgerRepo";

/** Live list of ledgers the signed-in user has been invited to (by email). */
export function useMyInvites(email: string | null): Ledger[] {
  const [invites, setInvites] = useState<Ledger[]>([]);
  useEffect(() => {
    if (!email) return;
    return ledgerRepo.subscribeInvites(email, setInvites);
  }, [email]);
  return invites;
}
