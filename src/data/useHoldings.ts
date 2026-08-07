import type { Holding } from "../domain/types";
import { holdingRepo } from "./holdingRepo";
import { useLiveQuery } from "./useLiveQuery";

const NO_HOLDINGS: Holding[] = [];
const NO_FX: Record<string, number> = {};

/** Live holdings for a ledger, without the FX rates. Naming an endpoint or
 *  checking the price-reminder needs no valuation, so those callers shouldn't
 *  pay for a second subscription. */
export function useLedgerHoldings(ledgerId: string): Holding[] {
  return useLiveQuery(ledgerId, NO_HOLDINGS, (emit) =>
    holdingRepo.subscribeHoldings(ledgerId, emit),
  );
}

/** Live current FX rates for a ledger ({ currency: rate-into-base }). */
export function useFxRates(ledgerId: string): Record<string, number> {
  return useLiveQuery(ledgerId, NO_FX, (emit) => holdingRepo.subscribeFx(ledgerId, emit));
}

/** Live holdings + current FX rates, for the pages that value a portfolio.
 *  Valuation snapshots are a separate hook (useSnapshots) since only the
 *  Investments trend needs them. */
export function useHoldings(ledgerId: string): {
  holdings: Holding[];
  fx: Record<string, number>;
} {
  return { holdings: useLedgerHoldings(ledgerId), fx: useFxRates(ledgerId) };
}
