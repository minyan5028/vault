/**
 * A **Ledger Endpoint** is anything a Financial Event can move money to or
 * from: an Account, or a Holding.
 *
 * `Transaction.accountId` / `toAccountId` hold endpoint ids, not Account ids.
 * Most events name an Account on both sides, but a trade's cash leg is written
 * as a transfer whose far endpoint is the Holding itself (see `tradeTransfer`),
 * so the holding's value never double-counts against the cash accounts on the
 * Assets page.
 *
 * That substitution used to be implicit, and every consumer of an endpoint id
 * rediscovered it: the Timeline rendered a blank name for a sell leg, the
 * Assets page relied on iterating accounts to skip holdings, and the repair
 * script special-cases the ids it can't match. This module is the one place
 * that answers "what is this id?", so nothing else has to assume.
 */
import type { Account, Holding } from "../domain/types";

export type EndpointKind = "account" | "holding";

export interface LedgerEndpoint {
  id: string;
  kind: EndpointKind;
  /** An Account's name, or a Holding's ticker. */
  name: string;
  /** The currency the endpoint's balance is held in. */
  currency: string;
}

/**
 * Index every endpoint in a Ledger by id. Built once per render from data the
 * caller already holds; lookups are then O(1) rather than a scan per row.
 *
 * Archived accounts and holdings are included deliberately — history still
 * refers to them, and a row showing a blank name is worse than one naming an
 * archived account.
 */
export function endpointIndex(
  accounts: readonly Account[],
  holdings: readonly Holding[] = [],
): Map<string, LedgerEndpoint> {
  const index = new Map<string, LedgerEndpoint>();
  for (const a of accounts) {
    index.set(a.id, { id: a.id, kind: "account", name: a.name, currency: a.currency });
  }
  for (const h of holdings) {
    index.set(h.id, { id: h.id, kind: "holding", name: h.ticker, currency: h.currency });
  }
  return index;
}

/** The endpoint an id refers to, or null when it refers to neither an Account
 *  nor a Holding — a deleted one, or (a bug) an id that never existed. */
export function resolveEndpoint(
  id: string | null | undefined,
  index: ReadonlyMap<string, LedgerEndpoint>,
): LedgerEndpoint | null {
  return id ? (index.get(id) ?? null) : null;
}

/** An endpoint's display name, or `fallback` when it can't be resolved. */
export function endpointName(
  id: string | null | undefined,
  index: ReadonlyMap<string, LedgerEndpoint>,
  fallback = "",
): string {
  return resolveEndpoint(id, index)?.name ?? fallback;
}
