/**
 * Reconcile the purchase date that was stored twice.
 *
 * `Holding.buyDate` and the opening buy trade's `date` were independent copies
 * of one fact, so editing the holding's copy moved one and not the other — a
 * corrected purchase date appeared not to save, because the trade log went on
 * showing the old one. Under ADR-0010 the holding's field is a cache of the
 * earliest surviving buy, recomputed on every trade write.
 *
 * Where the two disagree today, the **stored buyDate wins** and is pushed onto
 * the opening trade. It is the date the owner typed and intended; the trade's
 * is the stale copy that never received the edit. Run this before the first
 * in-app correction, or the recompute will quietly adopt the stale date
 * instead.
 *
 * Only the earliest non-deleted buy is touched, and only its `date`. Shares,
 * price and amount are left exactly as fix_opening_trades.mjs set them.
 *
 * Usage: node scripts/backfill_buy_dates.mjs [--commit]
 * Without --commit it prints the plan (dry run) and writes nothing.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const day = (d) => d.toISOString().slice(0, 10);

const holdings = (await led.collection("holdings").get()).docs;
console.log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER} · ${holdings.length} holdings\n`);

const updates = [];
let agreed = 0;
let noBuyDate = 0;

for (const h of holdings) {
  const d = h.data();
  const ticker = (d.ticker ?? h.id).padEnd(8);

  if (!d.buyDate) {
    noBuyDate++;
    console.log(`· ${ticker} no stored buyDate — the log decides it`);
    continue;
  }

  const buys = (await h.ref.collection("trades").where("kind", "==", "buy").get()).docs
    .map((t) => ({ ref: t.ref, id: t.id, ...t.data() }))
    .filter((t) => !t.deletedAt)
    .sort((a, b) => a.date.toMillis() - b.date.toMillis() || a.id.localeCompare(b.id));

  if (buys.length === 0) {
    console.log(`⚠︎ ${ticker} stored buyDate ${day(d.buyDate.toDate())} but no buy trade to carry it`);
    continue;
  }

  const opening = buys[0];
  const stored = d.buyDate.toDate();
  if (day(opening.date.toDate()) === day(stored)) {
    agreed++;
    console.log(`· ${ticker} ${day(stored)} — already agrees`);
    continue;
  }

  console.log(
    `✎ ${ticker} trade ${day(opening.date.toDate())} → ${day(stored)}  (the date the owner typed wins)`,
  );
  updates.push({ ref: opening.ref, date: Timestamp.fromDate(stored) });
}

console.log(
  `\n${updates.length} opening trade(s) to move · ${agreed} already agree · ${noBuyDate} with no stored date`,
);

if (!commit) {
  console.log("\nDRY RUN — nothing written. Re-run to apply:");
  console.log("  node scripts/backfill_buy_dates.mjs --commit");
  process.exit(0);
}

const batch = db.batch();
for (const u of updates) batch.update(u.ref, { date: u.date });
await batch.commit();
console.log(`\n✓ Committed — ${updates.length} opening trade(s) moved.`);
process.exit(0);
