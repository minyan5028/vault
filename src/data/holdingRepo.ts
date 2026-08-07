/**
 * Persistence for market-valued positions (see the Holding domain type),
 * scoped by `ledgerId`. Holdings are buy-and-hold with periodic snapshots; a
 * snapshot records every holding's price + share count on one date (like a
 * spreadsheet column) and denormalizes the latest price/shares back onto each
 * holding for quick display. Current FX rates live in one small `meta/fx` doc.
 *
 * As in `transactionRepo`, reads are Firestore queries and writes go through
 * the plan/execute seam: `writes.ts` decides, `firestoreExec` commits.
 */
import {
  Timestamp,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { fromDateInputValue } from "../lib/date";
import type { Holding, PortfolioSnapshot, SnapshotEntry, Trade } from "../domain/types";
import { collectionRef, commitPlan, docRef, newDocId } from "./firestoreExec";
import {
  fxPath,
  holdingPath,
  holdingsPath,
  snapshotsPath,
  tradesPath,
  transactionsPath,
} from "./writePlan";
import {
  planAddHolding,
  planBuy,
  planRemoveHolding,
  planSell,
  planSnapshot,
  type HoldingCashLeg,
  type NewHolding,
  type TradeIds,
  type TradeInput,
} from "./writes";
import { asStored } from "./transactionRepo";

export type { NewHolding, TradeInput } from "./writes";

const holdingsCol = (ledgerId: string) => collectionRef(holdingsPath(ledgerId));
const tradesCol = (ledgerId: string, holdingId: string) =>
  collectionRef(tradesPath(ledgerId, holdingId));
const snapshotsCol = (ledgerId: string) => collectionRef(snapshotsPath(ledgerId));
const fxRef = (ledgerId: string) => docRef(fxPath(ledgerId));

/** Ids for a trade and its optional cash leg, allocated before planning. */
function tradeIds(ledgerId: string, holdingId: string, withCashLeg: boolean): TradeIds {
  return {
    tradeId: newDocId(tradesPath(ledgerId, holdingId)),
    transferId: withCashLeg ? newDocId(transactionsPath(ledgerId)) : undefined,
  };
}

function toTrade(s: QueryDocumentSnapshot<DocumentData>): Trade {
  const d = s.data();
  return {
    id: s.id,
    kind: d.kind,
    date: (d.date as Timestamp).toDate(),
    shares: d.shares ?? 0,
    price: d.price ?? 0,
    amount: d.amount ?? 0,
    realized: d.realized ?? 0,
  };
}

function toHolding(s: QueryDocumentSnapshot<DocumentData>): Holding {
  const d = s.data();
  return {
    id: s.id,
    ticker: d.ticker,
    name: d.name ?? null,
    class: d.class,
    currency: d.currency ?? "TWD",
    cost: d.cost ?? 0,
    shares: d.shares ?? 0,
    price: d.price ?? 0,
    pricedAt: (d.pricedAt as Timestamp | null)?.toDate() ?? null,
    realizedGain: d.realizedGain ?? 0,
    dividendReceived: d.dividendReceived ?? 0,
    dividendPerShare: d.dividendPerShare ?? 0,
    targetPrice: d.targetPrice ?? null,
    buyDate: (d.buyDate as Timestamp | null)?.toDate() ?? null,
    archived: d.archived ?? false,
    sortOrder: d.sortOrder ?? 0,
  };
}

function toSnapshot(s: QueryDocumentSnapshot<DocumentData>): PortfolioSnapshot {
  const d = s.data();
  return { date: d.date ?? s.id, entries: d.entries ?? {}, fx: d.fx ?? {} };
}

export const holdingRepo = {
  /** Live holdings (active first via sortOrder; archived filtered client-side). */
  subscribeHoldings(ledgerId: string, cb: (holdings: Holding[]) => void): Unsubscribe {
    return onSnapshot(
      holdingsCol(ledgerId),
      (snap) => cb(snap.docs.map(toHolding).sort((a, b) => a.sortOrder - b.sortOrder)),
      (e) => console.error("holdings", e),
    );
  },

  /** Set one currency's rate into the base currency (TWD), from the manual rate
   *  editor. Stamps updatedAt so the weekly auto-refresh backs off. */
  setFxRate(ledgerId: string, currency: string, rate: number): Promise<void> {
    return setDoc(
      fxRef(ledgerId),
      { rates: { [currency]: rate }, updatedAt: serverTimestamp() },
      { merge: true },
    );
  },

  /** Merge several rates at once (the weekly API auto-refresh). */
  setFxRates(ledgerId: string, rates: Record<string, number>): Promise<void> {
    return setDoc(fxRef(ledgerId), { rates, updatedAt: serverTimestamp() }, { merge: true });
  },

  /** Read current rates + when they were last set (millis, or null if never). */
  async getFxMeta(
    ledgerId: string,
  ): Promise<{ rates: Record<string, number>; updatedAt: number | null }> {
    const snap = await getDoc(fxRef(ledgerId));
    const d = snap.data();
    return {
      rates: (d?.rates as Record<string, number>) ?? {},
      updatedAt: (d?.updatedAt as Timestamp | undefined)?.toMillis() ?? null,
    };
  },

  /** Live current FX rates ({ currency: rate-into-base }). */
  subscribeFx(ledgerId: string, cb: (rates: Record<string, number>) => void): Unsubscribe {
    return onSnapshot(
      fxRef(ledgerId),
      (snap) => cb((snap.data()?.rates as Record<string, number>) ?? {}),
      (e) => console.error("fx", e),
    );
  },

  /** Live valuation snapshots, oldest first (for net-worth / return trends). */
  subscribeSnapshots(ledgerId: string, cb: (snaps: PortfolioSnapshot[]) => void): Unsubscribe {
    return onSnapshot(
      snapshotsCol(ledgerId),
      (snap) => cb(snap.docs.map(toSnapshot).sort((a, b) => a.date.localeCompare(b.date))),
      (e) => console.error("snapshots", e),
    );
  },

  /**
   * Add a holding: its cost/shares/price are the opening position, recorded as
   * the first `buy` trade. If a funding account is given, the opening buy also
   * debits that cash account (atomically).
   */
  async add(ledgerId: string, input: NewHolding, uid: string): Promise<string> {
    const holdingId = newDocId(holdingsPath(ledgerId));
    const ids = tradeIds(ledgerId, holdingId, input.fundingAccountId !== null);
    await commitPlan(planAddHolding(ledgerId, holdingId, input, uid, ids));
    return holdingId;
  },

  /** Buy more of a holding (average-cost): shares in, cash paid folded into the
   *  cost basis, with an optional cash leg. */
  async buy(ledgerId: string, holding: Holding, input: TradeInput, uid: string): Promise<void> {
    const ids = tradeIds(ledgerId, holding.id, input.cashAccountId !== null);
    await commitPlan(planBuy(ledgerId, holding, input, uid, ids));
  },

  /** Sell part or all of a holding (average-cost): removes shares at the average
   *  cost, banks the realized gain, and moves proceeds to cash (optional leg). */
  async sell(ledgerId: string, holding: Holding, input: TradeInput, uid: string): Promise<void> {
    const ids = tradeIds(ledgerId, holding.id, input.cashAccountId !== null);
    await commitPlan(planSell(ledgerId, holding, input, uid, ids));
  },

  /** Live trade log for one holding, newest first. */
  subscribeTrades(ledgerId: string, holdingId: string, cb: (trades: Trade[]) => void): Unsubscribe {
    return onSnapshot(
      tradesCol(ledgerId, holdingId),
      (snap) => cb(snap.docs.map(toTrade).sort((a, b) => b.date.getTime() - a.date.getTime())),
      (e) => console.error("trades", e),
    );
  },

  update(
    ledgerId: string,
    id: string,
    patch: Partial<NewHolding & { archived: boolean; dividendReceived: number }>,
  ) {
    return updateDoc(docRef(holdingPath(ledgerId, id)), patch);
  },

  /**
   * Delete a holding entirely: soft-delete every paired cash transfer (undoing
   * their effect on the funding accounts), then hard-delete the holding doc and
   * its trades. The projections are reversed once, netted across all legs.
   * Use for a mis-entered holding; prefer archiving to keep history.
   */
  async remove(ledgerId: string, holding: Holding): Promise<void> {
    const txCol = collectionRef(transactionsPath(ledgerId));
    const [asDest, asSrc, trades] = await Promise.all([
      getDocs(query(txCol, where("toAccountId", "==", holding.id))),
      getDocs(query(txCol, where("accountId", "==", holding.id))),
      getDocs(tradesCol(ledgerId, holding.id)),
    ]);
    // Both queries return the same doc for a leg whose two endpoints are this
    // holding, so dedupe by id — reversing one leg twice would corrupt the
    // rollup by exactly its own amount.
    const legs = new Map<string, HoldingCashLeg>();
    for (const snap of [...asDest.docs, ...asSrc.docs]) {
      if (snap.data().deletedAt) continue;
      legs.set(snap.id, { txId: snap.id, event: asStored(snap.data()) });
    }
    await commitPlan(
      planRemoveHolding(
        ledgerId,
        holding.id,
        [...legs.values()],
        trades.docs.map((t) => t.id),
      ),
    );
  },

  /**
   * Record a valuation snapshot for a date: writes only the holdings in
   * `entries` (a partial update — e.g. just the USD holdings), refreshes their
   * denormalized price/shares/pricedAt, and updates current FX — all
   * atomically. Untouched holdings keep their previous pricedAt.
   */
  async addSnapshot(
    ledgerId: string,
    snap: { date: string; entries: Record<string, SnapshotEntry>; fx: Record<string, number> },
  ): Promise<void> {
    await commitPlan(planSnapshot(ledgerId, snap, fromDateInputValue(snap.date)));
  },
};
