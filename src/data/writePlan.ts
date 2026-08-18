/**
 * A description of what to write, as a plain value.
 *
 * The repos decide *what* changes; this module gives them a vocabulary to say
 * it in without touching Firestore, and `firestoreExec` turns the result into
 * an actual batch or transaction. That split is the seam: a WritePlan can be
 * asserted with `toEqual` in a unit test, so the write path — where every
 * rollup bug so far has lived — becomes testable without an emulator.
 *
 * Firestore's write sentinels (`serverTimestamp()`, `increment()`,
 * `Timestamp`) are opaque objects that a test can't meaningfully inspect, so
 * they are represented here symbolically and translated at execution time.
 */

/** A symbolic stand-in for a Firestore write sentinel. */
export type Sentinel =
  | { $: "serverTime" }
  | { $: "increment"; by: number }
  | { $: "time"; ms: number };

/** The server's write time. */
export const serverTime = (): Sentinel => ({ $: "serverTime" });

/** An atomic numeric increment — the rollups are maintained entirely with these. */
export const incrementBy = (by: number): Sentinel => ({ $: "increment", by });

/** A fixed instant, stored as a Firestore Timestamp. */
export const atTime = (date: Date): Sentinel => ({ $: "time", ms: date.getTime() });

/** True when a value is a sentinel rather than ordinary data. Field names
 *  starting with `$` are therefore reserved; the domain uses none. */
export function isSentinel(v: unknown): v is Sentinel {
  return typeof v === "object" && v !== null && "$" in v;
}

export type PlanValue =
  | Sentinel
  | string
  | number
  | boolean
  | null
  | PlanValue[]
  | { [key: string]: PlanValue };

export type PlanData = Record<string, PlanValue>;

/** A document path as path segments: ["ledgers", id, "transactions", txId]. */
export type DocPath = readonly string[];

export type WriteOp =
  | { kind: "set"; path: DocPath; data: PlanData; merge?: true }
  | { kind: "update"; path: DocPath; data: PlanData }
  | { kind: "delete"; path: DocPath };

/** An ordered set of document writes, committed atomically by the executor. */
export interface WritePlan {
  ops: readonly WriteOp[];
}

export const EMPTY_PLAN: WritePlan = { ops: [] };

/** Concatenate plans, preserving order. */
export function concatPlans(...plans: readonly WritePlan[]): WritePlan {
  return { ops: plans.flatMap((p) => p.ops) };
}

// ── Document paths ────────────────────────────────────────────────────────────
// The one place that knows how a Ledger is laid out in Firestore. Pure strings,
// so the planners can name a document without importing the SDK.

export const ledgerPath = (ledgerId: string): DocPath => ["ledgers", ledgerId];
export const transactionsPath = (ledgerId: string): DocPath => [
  ...ledgerPath(ledgerId),
  "transactions",
];
export const transactionPath = (ledgerId: string, txId: string): DocPath => [
  ...transactionsPath(ledgerId),
  txId,
];
export const projectsPath = (ledgerId: string): DocPath => [...ledgerPath(ledgerId), "projects"];
export const projectPath = (ledgerId: string, projectId: string): DocPath => [
  ...projectsPath(ledgerId),
  projectId,
];
export const rollupsPath = (ledgerId: string): DocPath => [...ledgerPath(ledgerId), "rollups"];
export const holdingsPath = (ledgerId: string): DocPath => [...ledgerPath(ledgerId), "holdings"];
export const tradesPath = (ledgerId: string, holdingId: string): DocPath => [
  ...holdingPath(ledgerId, holdingId),
  "trades",
];
export const snapshotsPath = (ledgerId: string): DocPath => [...ledgerPath(ledgerId), "snapshots"];
export const balanceRollupPath = (ledgerId: string): DocPath => [
  ...ledgerPath(ledgerId),
  "meta",
  "balances",
];
export const monthRollupPath = (ledgerId: string, yearMonth: string): DocPath => [
  ...ledgerPath(ledgerId),
  "rollups",
  yearMonth,
];
export const holdingPath = (ledgerId: string, holdingId: string): DocPath => [
  ...ledgerPath(ledgerId),
  "holdings",
  holdingId,
];
export const tradePath = (ledgerId: string, holdingId: string, tradeId: string): DocPath => [
  ...holdingPath(ledgerId, holdingId),
  "trades",
  tradeId,
];
export const snapshotPath = (ledgerId: string, date: string): DocPath => [
  ...ledgerPath(ledgerId),
  "snapshots",
  date,
];
export const fxPath = (ledgerId: string): DocPath => [...ledgerPath(ledgerId), "meta", "fx"];

