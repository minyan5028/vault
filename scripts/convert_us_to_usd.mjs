/**
 * Convert US Stock Investment from a TWD account into a real USD account
 * (route A / multi-currency). After this:
 *   - account.currency = USD, openingBalance in USD (a plug so cash = $2145.44)
 *   - 13 buy transfers (US Stock → holding) recorded in real USD cost
 *   - 8 deposit transfers (Investment TWD → US Stock USD) become cross-currency:
 *     source keeps its TWD amount, destination credited amount/31.46 in USD
 *   - meta/balances netFlow for US Stock + each holding switched to USD
 *
 * The Investment (TWD) side of the deposits is unchanged, so its balance holds.
 * Idempotent guard: aborts if the account is already USD.
 *
 * Usage: node scripts/convert_us_to_usd.mjs [--commit]   (dry run without --commit)
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
const ACCT = "us-stock-investment";
const FX = 31.46;
const TARGET_CASH_USD_MINOR = 214544; // $2,145.44 the user confirmed

const sa = JSON.parse(readFileSync("serviceAccountKey.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);
const m = (n) => (n / 100).toFixed(2);

const acctRef = led.collection("accounts").doc(ACCT);
const acct = (await acctRef.get()).data();
if (acct.currency === "USD") {
  console.error("Abort: account is already USD. Conversion has run.");
  process.exit(1);
}

// USD holdings and their real USD cost (minor).
const holdings = (await led.collection("holdings").get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((h) => h.currency === "USD");
const holdingIds = new Set(holdings.map((h) => h.id));
const costOf = Object.fromEntries(holdings.map((h) => [h.id, h.cost]));

// Buy transfers (US Stock → holding), tagged from the earlier backfill.
const buys = (await led.collection("transactions").where("accountId", "==", ACCT).get()).docs.filter(
  (d) => holdingIds.has(d.data().toAccountId) && !d.data().deletedAt,
);
// Deposit transfers (something → US Stock).
const deposits = (
  await led.collection("transactions").where("toAccountId", "==", ACCT).get()
).docs.filter((d) => !d.data().deletedAt);

const batch = db.batch();
const holdingNetFlow = {};
let buyUsdTotal = 0;
let depUsdTotal = 0;

console.log(`${commit ? "COMMIT" : "DRY RUN"} @ FX ${FX}\n`);
console.log("--- BUY transfers (US Stock USD → holding) ---");
for (const d of buys) {
  const t = d.data();
  const usd = costOf[t.toAccountId] ?? 0; // real USD cost, minor
  buyUsdTotal += usd;
  holdingNetFlow[t.toAccountId] = (holdingNetFlow[t.toAccountId] ?? 0) + usd;
  console.log(`  ${t.title.padEnd(7)} ${m(t.amount)} TWD → ${m(usd)} USD`);
  batch.update(d.ref, {
    amount: usd,
    currency: "USD",
    toAmount: usd, // holding is USD too (same-currency leg)
    baseAmount: Math.round((usd * FX) / 100) * 1, // TWD-equivalent snapshot
    baseCurrency: "TWD",
    fxRate: FX,
  });
}

console.log("\n--- DEPOSIT transfers (Investment TWD → US Stock USD) ---");
for (const d of deposits) {
  const t = d.data();
  const usd = Math.round(t.amount / FX); // credited USD, minor
  depUsdTotal += usd;
  console.log(`  ${t.date.toDate().toISOString().slice(0, 10)}  ${m(t.amount)} TWD → ${m(usd)} USD`);
  batch.update(d.ref, {
    // source (Investment TWD) leg unchanged: amount / currency / baseAmount stay
    toAmount: usd, // destination credited in USD
    fxRate: 1,
  });
}

const netFlowUsd = depUsdTotal - buyUsdTotal;
const openingUsd = TARGET_CASH_USD_MINOR - netFlowUsd; // plug so cash = target

console.log("\n--- account ---");
console.log(`  deposits: ${m(depUsdTotal)} USD   buys: ${m(buyUsdTotal)} USD`);
console.log(`  netFlow: ${m(netFlowUsd)} USD   openingBalance(plug): ${m(openingUsd)} USD`);
console.log(`  cash balance after: ${m(openingUsd + netFlowUsd)} USD  (target ${m(TARGET_CASH_USD_MINOR)})`);

batch.update(acctRef, { currency: "USD", openingBalance: openingUsd });

// Rewrite the balance rollup for the touched endpoints in absolute USD.
const netFlow = { [ACCT]: netFlowUsd };
for (const [hid, v] of Object.entries(holdingNetFlow)) netFlow[hid] = v;
batch.set(led.collection("meta").doc("balances"), { netFlow }, { merge: true });
console.log("\n  rollup netFlow set (absolute USD):", ACCT, "=", m(netFlowUsd), "+ 13 holdings");

if (!commit) {
  console.log("\nDry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}
await batch.commit();
console.log("\n✓ Committed.");
process.exit(0);
