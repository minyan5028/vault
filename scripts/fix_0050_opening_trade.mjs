/**
 * Give 0050 the opening buy trade it never had.
 *
 * The holding records 200 shares and a NT$8,000 basis but has an empty trade
 * log and no cash leg — it was created outside `planAddHolding`, which always
 * writes an opening buy. That was harmless while `cost` was maintained by
 * incrementing, and is not harmless now: under ADR-0010 the basis is a fold
 * over the log, so the first buy or sell recorded against 0050 would refold an
 * empty log and wipe the NT$8,000, silently.
 *
 * The trade is derived from what the holding already stores, not from market
 * data: 200 shares, NT$8,000, so NT$40.00 a share, dated the holding's own
 * `buyDate`. The owner confirmed all 200 were bought (no split or reinvestment
 * in that figure) and that the money came from the TWD `investment` account, so
 * the paired cash leg is written too — that account has never been debited for
 * this position.
 *
 * Tagged `source: "fix-0050-2026"` so the batch can be found and reverted, and
 * it aborts if 0050 already has any trade.
 *
 * Usage: node scripts/fix_0050_opening_trade.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
const TICKER = "0050";
const CASH_ACCOUNT = "investment";
const SOURCE = "fix-0050-2026";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);
const uid = LEDGER; // owner uid of a personal ledger == the ledger id

const m = (n) => (n / 100).toFixed(2);
// The ledger is UTC+8; shift before slicing or a local midnight prints as the
// day before.
const local = (d) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
const yearMonth = (d) => local(d).slice(0, 7);

const holding = (await led.collection("holdings").get()).docs.find(
  (h) => (h.data().ticker ?? h.id) === TICKER,
);
if (!holding) {
  console.error(`Abort: no holding with ticker ${TICKER}.`);
  process.exit(1);
}
const h = holding.data();

const existing = await holding.ref.collection("trades").limit(1).get();
if (!existing.empty) {
  console.error(`Abort: ${TICKER} already has trades. Nothing to repair.`);
  process.exit(1);
}
if (!h.buyDate) {
  console.error(`Abort: ${TICKER} has no buyDate to date the opening trade with.`);
  process.exit(1);
}

const shares = h.shares ?? 0;
const cost = h.cost ?? 0;
const price = shares > 0 ? Math.round((cost * 10000) / shares) : 0;
const date = h.buyDate;

console.log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}\n`);
console.log(`holding   ${TICKER}  (${holding.id})`);
console.log(`opening   buy ${(shares / 10000).toFixed(4)} × ${m(price)} = ${m(cost)} TWD`);
console.log(`date      ${local(date.toDate()).slice(0, 10)} (${yearMonth(date.toDate())})`);
console.log(`cash leg  ${CASH_ACCOUNT} → ${holding.id}, ${m(cost)} TWD`);
console.log(`\nafter this the fold reproduces the stored figures exactly:`);
console.log(`  cost ${m(cost)} · realizedGain 0.00 · traded ${(shares / 10000).toFixed(4)} shares`);
console.log(`\nthe holding document itself is not touched.`);

if (!commit) {
  console.log("\nDRY RUN — nothing written. Re-run to apply:");
  console.log("  node scripts/fix_0050_opening_trade.mjs --commit");
  process.exit(0);
}

const txRef = led.collection("transactions").doc();
const tradeRef = holding.ref.collection("trades").doc();
const batch = db.batch();

batch.set(txRef, {
  type: "transfer",
  amount: cost,
  currency: "TWD",
  toAmount: cost,
  baseAmount: cost,
  baseCurrency: "TWD",
  fxRate: 1,
  date,
  yearMonth: yearMonth(date.toDate()),
  categoryId: null,
  projectId: null,
  accountId: CASH_ACCOUNT,
  toAccountId: holding.id,
  title: TICKER,
  note: null,
  createdBy: uid,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  deletedAt: null,
  source: SOURCE,
});

batch.set(tradeRef, {
  kind: "buy",
  date,
  shares,
  price,
  amount: cost,
  realized: 0,
  transferId: txRef.id,
  createdAt: FieldValue.serverTimestamp(),
});

// A transfer moves balances only — it contributes to no month total.
batch.set(
  led.collection("meta").doc("balances"),
  {
    netFlow: {
      [CASH_ACCOUNT]: FieldValue.increment(-cost),
      [holding.id]: FieldValue.increment(cost),
    },
  },
  { merge: true },
);

await batch.commit();
console.log(`\n✓ Committed — trade ${tradeRef.id}, cash leg ${txRef.id}.`);
process.exit(0);
