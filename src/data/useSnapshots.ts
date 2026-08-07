import type { PortfolioSnapshot } from "../domain/types";
import { holdingRepo } from "./holdingRepo";
import { useLiveQuery } from "./useLiveQuery";

const NONE: PortfolioSnapshot[] = [];

/** Live valuation snapshots for a ledger — its own subscription so only the
 *  Investments value-trend pulls them (not the Assets/Manage pages). */
export function useSnapshots(ledgerId: string): PortfolioSnapshot[] {
  return useLiveQuery(ledgerId, NONE, (emit) => holdingRepo.subscribeSnapshots(ledgerId, emit));
}
