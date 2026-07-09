/**
 * Backfill the US-stock cash legs: for each USD holding, create a transfer from
 * the `us-stock-investment` (TWD) account into the holding for its cost basis
 * (cost_usd × 32), dated at buyDate, plus an opening `buy` trade record. This
 * draws the brokerage cash account down by what was actually invested, so net
 * worth stops double-counting deposited cash and holding value.
 *
 * All transfers are tagged `source: "backfill-us-2026"` so the whole batch can
 * be reverted. Idempotent: aborts if that tag already exists.
 *
 * Usage: node scripts/backfill_us_transfers.mjs [--commit]
 * Without --commit it prints the plan (dry run) and writes nothing.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
const CASH_ACCOUNT = "us-stock-investment";
const FX = 32;
const SOURCE = "backfill-us-2026";

const serviceAccount = JSON.parse(readFileSync("serviceAccountKey.json", "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

// Owner uid of a personal ledger == the ledger id.
const uid = LEDGER;

// Guard: don't run twice.
const existing = await led.collection("transactions").where("source", "==", SOURCE).limit(1).get();
if (!existing.empty) {
  console.error(`Abort: transactions with source="${SOURCE}" already exist. Backfill has run.`);
  process.exit(1);
}

const yearMonth = (d) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 7);
const m = (n) => (n / 100).toFixed(2);

const holdings = (await led.collection("holdings").get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((h) => h.currency === "USD");

const batch = db.batch();
let totalTwd = 0;
const holdingNetFlow = {};

console.log(`${commit ? "COMMIT" : "DRY RUN"} — ${holdings.length} USD holdings\n`);
console.log("ticker   buyDate     shares      buyPx    cost(USD)   transfer(TWD)");

for (const h of holdings) {
  const date = h.buyDate.toDate();
  const buyPrice = h.shares > 0 ? Math.round((h.cost * 10000) / h.shares) : 0;

  // Opening buy trade (holding-currency USD), for the trade log.
  const tradeRef = led.collection("holdings").doc(h.id).collection("trades").doc();
  batch.set(tradeRef, {
    kind: "buy",
    date: Timestamp.fromDate(date),
    shares: h.shares,
    price: buyPrice,
    amount: h.cost,
    realized: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  const twd = h.cost * FX; // cost is ×100 USD minor; ×32 → ×100 TWD minor
  const line = `${h.ticker.padEnd(8)} ${date.toISOString().slice(0, 10)}  ${(h.shares / 10000).toFixed(4).padStart(9)}  ${m(buyPrice).padStart(8)}  ${m(h.cost).padStart(9)}   ${m(twd).padStart(10)}`;

  if (twd === 0) {
    console.log(line + "   (skip transfer: 0)");
    continue;
  }
  console.log(line);

  // Cash leg: transfer from the brokerage cash account into the holding.
  const txRef = led.collection("transactions").doc();
  batch.set(txRef, {
    type: "transfer",
    amount: twd,
    currency: "TWD",
    baseAmount: twd,
    baseCurrency: "TWD",
    fxRate: 1,
    date: Timestamp.fromDate(date),
    yearMonth: yearMonth(date),
    categoryId: null,
    accountId: CASH_ACCOUNT,
    toAccountId: h.id,
    title: h.ticker,
    note: `買入 ${(h.shares / 10000).toFixed(4)} 股 @ $${m(buyPrice)} (×${FX})`,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
    source: SOURCE,
  });
  totalTwd += twd;
  holdingNetFlow[h.id] = (holdingNetFlow[h.id] ?? 0) + twd;
}

// Balance rollup: debit the cash account, credit each holding endpoint.
const netFlow = { [CASH_ACCOUNT]: FieldValue.increment(-totalTwd) };
for (const [hid, v] of Object.entries(holdingNetFlow)) netFlow[hid] = FieldValue.increment(v);
batch.set(led.collection("meta").doc("balances"), { netFlow }, { merge: true });

console.log(`\ntotal transferred out of ${CASH_ACCOUNT}: ${m(totalTwd)} TWD`);
console.log(`us-stock-investment balance after: 690000.00 → ${m(69000000 - totalTwd)} TWD`);

if (!commit) {
  console.log("\nDry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}
await batch.commit();
console.log("\n✓ Committed.");
process.exit(0);
