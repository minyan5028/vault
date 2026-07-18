/**
 * Correct each holding's OPENING buy trade to reflect the actual purchase.
 *
 * The Notion→Vault migration seeded every opening buy trade with the holding's
 * *current* (DRIP-grown) share count and a back-solved average price, so the
 * trade log misrepresents the original buy (e.g. DIS shows "15.2506 × $86.55"
 * instead of the real "15 × $88.00"). The holding aggregate is fine — cost is
 * the true basis and shares are DRIP-grown via snapshots — only the trade's
 * `shares`/`price` are wrong. `amount` (cash paid) already matches, so we leave
 * it, and never touch the Holding doc.
 *
 * Source of truth: docs/References/Stocks Recorder.xlsx (shares = "amounts",
 * price = per-share buy "price"). Only the single opening `buy` trade per
 * holding is updated; DRIP is not a trade (it rides on snapshots) so no extra
 * records are created.
 *
 * Usage: node scripts/fix_opening_trades.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";

// holdingId → { shares (whole), price (per-share, dollars) } from the spreadsheet.
// wbd/nflx/brk-b already correct (no DRIP) — listed for completeness / verification.
const BUY = {
  dis: { shares: 15, price: 88.0 },
  txn: { shares: 4, price: 130.27 },
  wbd: { shares: 5, price: 0 },
  hsy: { shares: 10, price: 190.0 },
  sbux: { shares: 20, price: 85.0 },
  nvda: { shares: 11, price: 115.51 },
  googl: { shares: 5, price: 300.0 },
  msft: { shares: 1, price: 389.04 },
  nflx: { shares: 20, price: 80.0 },
  "brk-b": { shares: 6, price: 480.0 },
  mo: { shares: 18, price: 48.82 },
  o: { shares: 30, price: 64.95 },
  t: { shares: 20, price: 36.64 },
};

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const holdingsCol = db.collection("ledgers").doc(LEDGER).collection("holdings");

const updates = [];
for (const [hid, want] of Object.entries(BUY)) {
  const tradesSnap = await holdingsCol.doc(hid).collection("trades").where("kind", "==", "buy").get();
  const buys = tradesSnap.docs;
  if (buys.length !== 1) {
    console.log(`⚠︎  ${hid}: expected 1 buy trade, found ${buys.length} — skipping`);
    continue;
  }
  const ref = buys[0].ref;
  const cur = buys[0].data();
  const wantShares = Math.round(want.shares * 10000);
  const wantPrice = Math.round(want.price * 100);
  const changed = cur.shares !== wantShares || cur.price !== wantPrice;
  console.log(
    `${changed ? "✎" : "·"} ${hid.padEnd(6)} ` +
      `shares ${(cur.shares / 10000).toString().padEnd(9)}→ ${want.shares.toString().padEnd(4)} ` +
      `price ${(cur.price / 100).toString().padEnd(8)}→ ${want.price.toString().padEnd(7)} ` +
      `(amount ${(cur.amount / 100).toString()} unchanged)`,
  );
  if (changed) updates.push({ ref, shares: wantShares, price: wantPrice });
}

console.log(`\n${commit ? "COMMIT" : "DRY RUN"} — ${updates.length} trade(s) to correct`);
if (!commit) {
  console.log("Dry run — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}
const batch = db.batch();
for (const u of updates) batch.update(u.ref, { shares: u.shares, price: u.price });
await batch.commit();
console.log("✓ Committed.");
process.exit(0);
