/**
 * Link each existing trade to the cash leg that paid for it.
 *
 * Trades written before ADR-0010 store no `transferId`, so nothing connects a
 * trade to its transfer. `holdingRepo.remove` gets by on a query — every
 * transaction whose endpoint is the holding — which is enough to tear a whole
 * position down and useless for finding the one leg belonging to one trade.
 * Correcting a trade needs the link, or the money silently stops agreeing with
 * the cost basis.
 *
 * Matching is on (holding, date, amount), which is everything a leg and its
 * trade share. Where two or more candidate legs fit one trade — same holding,
 * same day, same amount — the pair is ambiguous and is left alone: such a
 * trade keeps `transferId` absent, meaning "link unknown", and the app edits
 * the trade without touching any transfer. Guessing here would attach a
 * correction to the wrong transaction.
 *
 * Only trades with no `transferId` field at all are considered, so re-running
 * is safe and converges.
 *
 * Usage: node scripts/backfill_trade_legs.mjs [--commit]
 * Without --commit it prints the plan (dry run) and writes nothing.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const m = (n) => (n / 100).toFixed(2);
const day = (d) => d.toISOString().slice(0, 10);

const holdings = (await led.collection("holdings").get()).docs;

// Every transfer touching a holding endpoint, read once and indexed in memory
// rather than queried per trade — the whole point of one scan.
const txs = (await led.collection("transactions").where("type", "==", "transfer").get()).docs;
const legsByHolding = new Map();
for (const t of txs) {
  const d = t.data();
  if (d.deletedAt) continue;
  for (const endpoint of [d.accountId, d.toAccountId]) {
    if (!endpoint) continue;
    if (!legsByHolding.has(endpoint)) legsByHolding.set(endpoint, []);
    const list = legsByHolding.get(endpoint);
    // A leg whose two endpoints are the same holding must appear once.
    if (!list.some((l) => l.id === t.id)) list.push({ id: t.id, ...d });
  }
}

console.log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}`);
console.log(`${holdings.length} holdings · ${txs.length} transfers scanned\n`);

const updates = [];
const ambiguous = [];
let alreadyLinked = 0;
let noCandidate = 0;

for (const h of holdings) {
  const ticker = h.data().ticker ?? h.id;
  const legs = legsByHolding.get(h.id) ?? [];
  const trades = (await h.ref.collection("trades").get()).docs;
  const claimed = new Set();

  for (const tr of trades) {
    const d = tr.data();
    if (d.transferId !== undefined) {
      alreadyLinked++;
      continue;
    }
    const when = d.date.toDate();
    const fits = legs.filter(
      (l) => !claimed.has(l.id) && l.amount === d.amount && day(l.date.toDate()) === day(when),
    );

    if (fits.length === 1) {
      claimed.add(fits[0].id);
      updates.push({ ref: tr.ref, transferId: fits[0].id });
      console.log(
        `✓ ${ticker.padEnd(8)} ${d.kind.padEnd(4)} ${day(when)} ${m(d.amount).padStart(11)} → ${fits[0].id}`,
      );
    } else if (fits.length === 0) {
      noCandidate++;
      console.log(
        `· ${ticker.padEnd(8)} ${d.kind.padEnd(4)} ${day(when)} ${m(d.amount).padStart(11)}   no cash leg found — left unknown`,
      );
    } else {
      ambiguous.push({ ticker, kind: d.kind, when: day(when), amount: d.amount, n: fits.length });
      console.log(
        `⚠︎ ${ticker.padEnd(8)} ${d.kind.padEnd(4)} ${day(when)} ${m(d.amount).padStart(11)}   ${fits.length} legs fit — left unknown`,
      );
    }
  }
}

console.log(
  `\n${updates.length} to link · ${ambiguous.length} ambiguous · ${noCandidate} with no candidate · ${alreadyLinked} already linked`,
);
if (ambiguous.length > 0) {
  console.log("\nAmbiguous — these trades stay editable, but their cash leg is not linked:");
  for (const a of ambiguous)
    console.log(`  ${a.ticker} ${a.kind} ${a.when} ${m(a.amount)} — ${a.n} candidates`);
}

if (!commit) {
  console.log("\nDRY RUN — nothing written. Re-run to apply:");
  console.log("  node scripts/backfill_trade_legs.mjs --commit");
  process.exit(0);
}

const batch = db.batch();
for (const u of updates) batch.update(u.ref, { transferId: u.transferId });
await batch.commit();
console.log(`\n✓ Committed — ${updates.length} trade(s) linked.`);
process.exit(0);
