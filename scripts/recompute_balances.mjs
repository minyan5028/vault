/**
 * Rebuild meta/balances.netFlow from every non-deleted transaction — repair after
 * the rollup was wiped (seedLedgerCatalog set netFlow:{} when provisionLedger
 * mis-detected the existing ledger as new). Each account moves in its own
 * currency: source by amount, a transfer's destination by toAmount.
 *
 * Usage: node scripts/recompute_balances.mjs <ledgerId> [--commit]
 *
 * Run scripts/audit_projections.mjs first — it is read-only and tells you
 * whether a rebuild is needed at all, and for which ledger.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!LEDGER) {
  console.error("Usage: node scripts/recompute_balances.mjs <ledgerId> [--commit]");
  process.exit(1);
}
const sa = JSON.parse(readFileSync("serviceAccountKey.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const txs = await led.collection("transactions").get();
const netFlow = {};
const add = (acc, v) => { if (acc) netFlow[acc] = (netFlow[acc] ?? 0) + v; };
let n = 0;
for (const d of txs.docs) {
  const t = d.data();
  if (t.deletedAt) continue;
  n++;
  const amount = t.amount, toAmount = t.toAmount ?? t.amount;
  if (t.type === "income") add(t.accountId, amount);
  else if (t.type === "expense") add(t.accountId, -amount);
  else if (t.type === "transfer") { add(t.accountId, -amount); add(t.toAccountId, toAmount); }
}

// Compare against current + show account balances (opening + netFlow).
const accts = Object.fromEntries((await led.collection("accounts").get()).docs.map((d) => [d.id, d.data()]));
const m = (v) => (v / 100).toFixed(2);
console.log(`${commit ? "COMMIT" : "DRY RUN"} — recomputed from ${n} transactions\n`);
console.log("account                netFlow          balance(opening+netFlow)");
for (const id of Object.keys(accts).sort()) {
  const a = accts[id];
  const nf = netFlow[id] ?? 0;
  const bal = (a.openingBalance ?? 0) + nf;
  console.log(`  ${id.padEnd(22)} ${m(nf).padStart(12)}   ${m(bal).padStart(12)} ${a.currency}`);
}
const holdingKeys = Object.keys(netFlow).filter((k) => !accts[k]);
console.log(`\n(+ ${holdingKeys.length} holding endpoints, not displayed)`);

if (!commit) {
  console.log("\nDry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}
await led.collection("meta").doc("balances").set({ netFlow });
console.log("\n✓ Committed (meta/balances.netFlow rebuilt).");
process.exit(0);
