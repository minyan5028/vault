/**
 * Persistence for market-valued positions (see the Holding domain type),
 * scoped by `ledgerId`. Holdings are buy-and-hold with periodic snapshots; a
 * snapshot records every holding's price + share count on one date (like a
 * spreadsheet column) and denormalizes the latest price/shares back onto each
 * holding for quick display. Current FX rates live in one small `meta/fx` doc.
 */
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { fromDateInputValue } from "../lib/date";
import { applySell } from "../lib/holdings";
import {
  writeTransferToBatch,
  softDeleteInBatch,
  commitBalanceDelta,
  type NewTransactionInput,
} from "./transactionRepo";
import { accountDeltas } from "../lib/balance";
import type { Holding, PortfolioSnapshot, SnapshotEntry, Trade, TradeKind } from "../domain/types";

const holdingsCol = (ledgerId: string) => collection(db, "ledgers", ledgerId, "holdings");
const tradesCol = (ledgerId: string, holdingId: string) =>
  collection(doc(holdingsCol(ledgerId), holdingId), "trades");
const snapshotsCol = (ledgerId: string) => collection(db, "ledgers", ledgerId, "snapshots");
const fxRef = (ledgerId: string) => doc(db, "ledgers", ledgerId, "meta", "fx");

export interface NewHolding {
  ticker: string;
  name: string | null;
  class: Holding["class"];
  currency: string;
  cost: number;
  shares: number;
  price: number;
  targetPrice: number | null;
  buyDate: Date | null;
  /** Cash account the opening buy is paid from; null keeps the holding
   *  standalone (no cash leg). */
  fundingAccountId: string | null;
}

/** A buy (加碼) or sell (賣出) against an existing holding. */
export interface TradeInput {
  /** Shares transacted (×10000). */
  shares: number;
  /** Per-share price (×100). */
  price: number;
  /** Cash moved (×100): a buy's cost paid, a sell's proceeds received. */
  amount: number;
  date: Date;
  /** Cash account the money comes from (buy) / lands in (sell); null = no cash
   *  leg. Must match the holding's currency. */
  cashAccountId: string | null;
}

/** The transfer that moves cash for a trade: buy debits the cash account into
 *  the holding; sell moves the proceeds from the holding back to cash. The
 *  holding's id stands in as a (non-listed) transfer endpoint, so its balance
 *  never double-counts against the cash accounts on the Assets page. */
function tradeTransfer(
  kind: TradeKind,
  holding: Pick<Holding, "id" | "ticker" | "currency">,
  input: TradeInput,
  uid: string,
): NewTransactionInput {
  const cashAccountId = input.cashAccountId as string;
  return {
    type: "transfer",
    amount: input.amount,
    currency: holding.currency,
    baseAmount: input.amount,
    baseCurrency: holding.currency,
    fxRate: 1,
    date: input.date,
    categoryId: null,
    accountId: kind === "buy" ? cashAccountId : holding.id,
    toAccountId: kind === "buy" ? holding.id : cashAccountId,
    title: holding.ticker,
    note: null,
    createdBy: uid,
  };
}

function tradeDoc(kind: TradeKind, input: TradeInput, realized: number) {
  return {
    kind,
    date: Timestamp.fromDate(input.date),
    shares: input.shares,
    price: input.price,
    amount: input.amount,
    realized,
    createdAt: serverTimestamp(),
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
  async getFxMeta(ledgerId: string): Promise<{ rates: Record<string, number>; updatedAt: number | null }> {
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
    const { buyDate, fundingAccountId, ...rest } = input;
    const date = buyDate ?? new Date();
    const ref = doc(holdingsCol(ledgerId));
    const batch = writeBatch(db);
    batch.set(ref, {
      ...rest,
      realizedGain: 0,
      dividendReceived: 0,
      buyDate: buyDate ? Timestamp.fromDate(buyDate) : null,
      pricedAt: serverTimestamp(),
      archived: false,
      sortOrder: Date.now(),
    });
    const openingBuy: TradeInput = {
      shares: rest.shares,
      price: rest.price,
      amount: rest.cost,
      date,
      cashAccountId: fundingAccountId,
    };
    batch.set(doc(tradesCol(ledgerId, ref.id)), tradeDoc("buy", openingBuy, 0));
    if (fundingAccountId) {
      const h = { id: ref.id, ticker: rest.ticker, currency: rest.currency };
      writeTransferToBatch(batch, ledgerId, tradeTransfer("buy", h, openingBuy, uid));
    }
    await batch.commit();
    return ref.id;
  },

  /** Buy more of a holding (average-cost): shares in, cash paid folded into the
   *  cost basis, with an optional cash leg. */
  async buy(ledgerId: string, holding: Holding, input: TradeInput, uid: string): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(holdingsCol(ledgerId), holding.id), {
      shares: increment(input.shares),
      cost: increment(input.amount),
      price: input.price,
      pricedAt: Timestamp.fromDate(input.date),
    });
    batch.set(doc(tradesCol(ledgerId, holding.id)), tradeDoc("buy", input, 0));
    if (input.cashAccountId) {
      writeTransferToBatch(batch, ledgerId, tradeTransfer("buy", holding, input, uid));
    }
    await batch.commit();
  },

  /** Sell part or all of a holding (average-cost): removes shares at the average
   *  cost, banks the realized gain, and moves proceeds to cash (optional leg). */
  async sell(ledgerId: string, holding: Holding, input: TradeInput, uid: string): Promise<void> {
    const r = applySell({ shares: holding.shares, cost: holding.cost }, input.shares, input.amount);
    const batch = writeBatch(db);
    batch.update(doc(holdingsCol(ledgerId), holding.id), {
      shares: increment(-input.shares),
      cost: increment(-r.costRemoved),
      realizedGain: increment(r.realized),
      price: input.price,
      pricedAt: Timestamp.fromDate(input.date),
    });
    batch.set(doc(tradesCol(ledgerId, holding.id)), tradeDoc("sell", input, r.realized));
    if (input.cashAccountId) {
      writeTransferToBatch(batch, ledgerId, tradeTransfer("sell", holding, input, uid));
    }
    await batch.commit();
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
    return updateDoc(doc(holdingsCol(ledgerId), id), patch);
  },

  /**
   * Delete a holding entirely: soft-delete every paired cash transfer (undoing
   * their effect on the funding accounts), then hard-delete the holding doc and
   * its trades. The balance rollup is reversed once, netted across all legs.
   * Use for a mis-entered holding; prefer archiving to keep history.
   */
  async remove(ledgerId: string, holding: Holding): Promise<void> {
    const txCol = collection(db, "ledgers", ledgerId, "transactions");
    const [asDest, asSrc] = await Promise.all([
      getDocs(query(txCol, where("toAccountId", "==", holding.id))),
      getDocs(query(txCol, where("accountId", "==", holding.id))),
    ]);
    const batch = writeBatch(db);
    const combined: Record<string, number> = {};
    for (const snap of [...asDest.docs, ...asSrc.docs]) {
      const d = snap.data();
      if (d.deletedAt) continue;
      softDeleteInBatch(batch, ledgerId, snap.id);
      const delta = accountDeltas(
        {
          type: d.type,
          accountId: d.accountId,
          toAccountId: d.toAccountId ?? null,
          amount: d.amount,
          toAmount: d.toAmount,
        },
        -1,
      );
      for (const [acc, v] of Object.entries(delta)) combined[acc] = (combined[acc] ?? 0) + v;
    }
    commitBalanceDelta(batch, ledgerId, combined);
    const trades = await getDocs(tradesCol(ledgerId, holding.id));
    for (const t of trades.docs) batch.delete(t.ref);
    batch.delete(doc(holdingsCol(ledgerId), holding.id));
    await batch.commit();
  },

  /**
   * Record a valuation snapshot for a date: writes only the holdings in
   * `entries` (a partial update — e.g. just the USD holdings), refreshes their
   * denormalized price/shares/pricedAt, and updates current FX — all
   * atomically. Untouched holdings keep their previous pricedAt.
   *
   * The snapshot doc is merged, so updating a second currency group on the same
   * date accumulates into one `snapshots/{date}` doc rather than overwriting it.
   */
  async addSnapshot(
    ledgerId: string,
    snap: { date: string; entries: Record<string, SnapshotEntry>; fx: Record<string, number> },
  ): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(snapshotsCol(ledgerId), snap.date), snap, { merge: true });
    const pricedAt = Timestamp.fromDate(fromDateInputValue(snap.date));
    for (const [holdingId, e] of Object.entries(snap.entries)) {
      batch.update(doc(holdingsCol(ledgerId), holdingId), {
        price: e.price,
        shares: e.shares,
        pricedAt,
      });
    }
    batch.set(fxRef(ledgerId), { rates: snap.fx }, { merge: true });
    await batch.commit();
  },
};
