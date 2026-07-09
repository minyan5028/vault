/**
 * Convert JPY Investment from a TWD account into a real JPY account (route A).
 * It's a pure cash account (no holdings): 2 deposits from Investment (TWD).
 * After this:
 *   - meta/fx gains JPY = 0.2 (1 JPY = 0.2 TWD)
 *   - account.currency = JPY, openingBalance = 0
 *   - each deposit becomes cross-currency: Investment keeps its TWD amount, the
 *     JPY account is credited amount/0.2 in JPY
 *   - meta/balances netFlow[jpy-investment] switched to absolute JPY
 * Balance is self-consistent: JPY total × 0.2 == the old TWD balance, so net
 * worth is unchanged. Idempotent: aborts if the account is already JPY.
 *
 * Usage: node scripts/convert_jpy_to_jpy.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
const ACCT = "jpy-investment";
const FX = 0.2; // 1 JPY = 0.2 TWD

const sa = JSON.parse(readFileSync("serviceAccountKey.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);
const m = (n) => (n / 100).toFixed(2);

const acctRef = led.collection("accounts").doc(ACCT);
const acct = (await acctRef.get()).data();
if (acct.currency === "JPY") {
  console.error("Abort: account is already JPY. Conversion has run.");
  process.exit(1);
}

const deposits = (
  await led.collection("transactions").where("toAccountId", "==", ACCT).get()
).docs.filter((d) => !d.data().deletedAt);

const batch = db.batch();
let jpyTotal = 0;

console.log(`${commit ? "COMMIT" : "DRY RUN"} @ FX ${FX} (1 JPY = ${FX} TWD)\n`);
console.log("--- DEPOSIT transfers (Investment TWD → JPY account) ---");
for (const d of deposits) {
  const t = d.data();
  const jpy = Math.round(t.amount / FX); // credited JPY, minor
  jpyTotal += jpy;
  console.log(`  ${t.date.toDate().toISOString().slice(0, 10)}  ${m(t.amount)} TWD → ${m(jpy)} JPY`);
  batch.update(d.ref, { toAmount: jpy, fxRate: 1 });
}

console.log("\n--- account ---");
console.log(`  currency → JPY, openingBalance → 0`);
console.log(`  netFlow: ${m(jpyTotal)} JPY   balance: ${m(jpyTotal)} JPY`);
console.log(`  = ${m(Math.round(jpyTotal * FX))} TWD (was 50000.00, unchanged)`);

batch.update(acctRef, { currency: "JPY", openingBalance: 0 });
batch.set(led.collection("meta").doc("fx"), { rates: { JPY: FX } }, { merge: true });
batch.set(led.collection("meta").doc("balances"), { netFlow: { [ACCT]: jpyTotal } }, { merge: true });

if (!commit) {
  console.log("\nDry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}
await batch.commit();
console.log("\n✓ Committed.");
process.exit(0);
