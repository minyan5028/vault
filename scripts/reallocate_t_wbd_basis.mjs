/**
 * Split T's cost basis with WBD, as the 2022 spinoff actually did.
 *
 * T was recorded as 20 shares at $36.64 for $732.80, and WBD — the 5 shares the
 * spinoff delivered — was recorded at zero cost. But a spinoff does not create
 * shares out of nothing: it divides the basis the owner already paid for. The
 * traced-back figure is $29.56 a share for T, which is 0.8068 of $36.64, so
 * 80.68% of the basis stayed with T and the remaining $141.60 belongs to WBD.
 *
 *   T     20 × $29.56 = $591.20
 *   WBD    5 × $28.32 = $141.60
 *                       ───────
 *                       $732.80   unchanged
 *
 * Conservation is the whole point. Repricing T alone would drop $141.60 of
 * money the owner really paid, overstating unrealized gain by that much for
 * good and making the eventual WBD sale look like pure profit.
 *
 * **No cash leg is touched.** The $732.80 left `us-stock-investment` once, when
 * T was bought, and it bought what later became both positions. T's transfer
 * therefore stays at $732.80 even though T's basis is now lower — the balance
 * of that account is unchanged, and no rollup moves. This is exactly why the
 * change cannot be made in the app: editing a trade's amount there moves its
 * cash leg with it, which is right for a correction and wrong for a
 * reallocation.
 *
 * WBD's trade also gets `transferId: null` — "deliberately no cash leg", which
 * is the truth about a spinoff — instead of the absent field that means "legacy,
 * link unknown".
 *
 * Aborts unless both holdings are in exactly the state described above, so it
 * cannot run twice or against data that has moved on.
 *
 * Usage: node scripts/reallocate_t_wbd_basis.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";

// Minor units: money ×100, shares ×10000.
const EXPECT = {
  T: { shares: 20_0000, price: 3664, amount: 73280 },
  WBD: { shares: 5_0000, price: 0, amount: 0 },
};
const TARGET = {
  T: { price: 2956, amount: 59120 },
  WBD: { price: 2832, amount: 14160 },
};

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const m = (n) => (n / 100).toFixed(2);
const sh = (n) => (n / 10000).toFixed(4);

const holdings = (await led.collection("holdings").get()).docs;
const found = {};

for (const ticker of ["T", "WBD"]) {
  const h = holdings.find((x) => x.data().ticker === ticker);
  if (!h) {
    console.error(`Abort: no holding with ticker ${ticker}.`);
    process.exit(1);
  }
  const buys = (await h.ref.collection("trades").get()).docs.filter(
    (t) => t.data().kind === "buy" && !t.data().deletedAt,
  );
  if (buys.length !== 1) {
    console.error(`Abort: ${ticker} has ${buys.length} buy trades; expected exactly 1.`);
    process.exit(1);
  }
  const t = buys[0];
  const d = t.data();
  const want = EXPECT[ticker];
  if (d.shares !== want.shares || d.price !== want.price || d.amount !== want.amount) {
    console.error(
      `Abort: ${ticker}'s buy is ${sh(d.shares)} × ${m(d.price)} = ${m(d.amount)}, ` +
        `expected ${sh(want.shares)} × ${m(want.price)} = ${m(want.amount)}. ` +
        `Either this has already run, or the data has moved on.`,
    );
    process.exit(1);
  }
  found[ticker] = { holding: h, trade: t, cost: h.data().cost ?? 0 };
}

const beforeTotal = found.T.cost + found.WBD.cost;
const afterTotal = TARGET.T.amount + TARGET.WBD.amount;

console.log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}\n`);
for (const ticker of ["T", "WBD"]) {
  const f = found[ticker];
  const want = TARGET[ticker];
  console.log(
    `${ticker.padEnd(4)} ${sh(EXPECT[ticker].shares)} shares · ` +
      `${m(EXPECT[ticker].price)} → ${m(want.price)} a share · ` +
      `basis ${m(f.cost)} → ${m(want.amount)}`,
  );
}
console.log(`\ntotal basis ${m(beforeTotal)} → ${m(afterTotal)}  ${beforeTotal === afterTotal ? "✓ conserved" : "✗ NOT CONSERVED"}`);
if (beforeTotal !== afterTotal) {
  console.error("\nAbort: the reallocation does not conserve the basis.");
  process.exit(1);
}
console.log(`\nnot touched: cash legs, account balances, rollups, share counts, dates`);
console.log(`  T's transfer stays at ${m(73280)} — that money did leave the account`);

if (!commit) {
  console.log("\nDRY RUN — nothing written. Re-run to apply:");
  console.log("  node scripts/reallocate_t_wbd_basis.mjs --commit");
  process.exit(0);
}

const batch = db.batch();
for (const ticker of ["T", "WBD"]) {
  const f = found[ticker];
  const want = TARGET[ticker];
  const tradePatch = { price: want.price, amount: want.amount };
  // A spinoff moves no cash. Say so explicitly rather than leaving the field
  // absent, which means "legacy trade, link unknown".
  if (ticker === "WBD") tradePatch.transferId = null;
  batch.update(f.trade.ref, tradePatch);
  batch.update(f.holding.ref, { cost: want.amount });
}
await batch.commit();
console.log(`\n✓ Committed — basis reallocated, total unchanged at ${m(afterTotal)}.`);
process.exit(0);
