/**
 * Read-only check: does each holding's stored cost basis agree with the fold
 * over its trade log?
 *
 * Under ADR-0010 `cost` and `realizedGain` are the fold's output, so the first
 * correction to any trade rewrites them from the log. If the stored figure had
 * drifted, that rewrite would look like an unexplained jump — this says, before
 * anything is edited, whether any holding will move and by how much.
 *
 * Drift is expected to be zero: planBuy/planSell built these incrementally from
 * the same events, and fix_opening_trades.mjs deliberately left every `amount`
 * intact while correcting shares and price, so the basis was never touched.
 * A non-zero row is a finding, not a rounding artefact.
 *
 * Held shares are NOT compared. They are snapshot-owned and DRIP-grown, so
 * differing from the traded count is the model, not a fault (ADR-0010) — the
 * gap is reported for information.
 *
 * Usage: node scripts/audit_trade_fold.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const m = (n) => (n / 100).toFixed(2);
const sh = (n) => (n / 10000).toFixed(4);

/** Mirrors replayTrades in src/lib/holdings.ts — date, buys before sells, id. */
function replay(trades) {
  const log = trades
    .filter((t) => !t.deletedAt)
    .sort((a, b) => {
      const byDate = a.date.toMillis() - b.date.toMillis();
      if (byDate !== 0) return byDate;
      if (a.kind !== b.kind) return a.kind === "buy" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  let shares = 0;
  let cost = 0;
  let realizedGain = 0;
  for (const t of log) {
    if (t.kind === "buy") {
      shares += t.shares;
      cost += t.amount;
      continue;
    }
    if (t.shares > shares) return { broken: t };
    const costRemoved = shares > 0 ? Math.round((cost * t.shares) / shares) : 0;
    realizedGain += t.amount - costRemoved;
    shares -= t.shares;
    cost -= costRemoved;
  }
  return { tradedShares: shares, cost, realizedGain };
}

const holdings = (await led.collection("holdings").get()).docs;
console.log(`ledger ${LEDGER} · ${holdings.length} holdings\n`);
console.log(
  "ticker    stored cost    folded cost      Δcost   stored gain   folded gain      Δgain    traded/held shares",
);

let drifted = 0;
let broken = 0;

for (const h of holdings) {
  const d = h.data();
  const ticker = (d.ticker ?? h.id).padEnd(8);
  const trades = (await h.ref.collection("trades").get()).docs.map((t) => ({ id: t.id, ...t.data() }));
  const r = replay(trades);

  if (r.broken) {
    broken++;
    console.log(`✗ ${ticker} log does not add up — a sell precedes the shares it sells`);
    continue;
  }

  const dCost = r.cost - (d.cost ?? 0);
  const dGain = r.realizedGain - (d.realizedGain ?? 0);
  const mark = dCost === 0 && dGain === 0 ? "·" : "✎";
  if (mark === "✎") drifted++;

  console.log(
    `${mark} ${ticker} ${m(d.cost ?? 0).padStart(12)} ${m(r.cost).padStart(14)} ${m(dCost).padStart(10)}  ` +
      `${m(d.realizedGain ?? 0).padStart(12)} ${m(r.realizedGain).padStart(13)} ${m(dGain).padStart(10)}    ` +
      `${sh(r.tradedShares)} / ${sh(d.shares ?? 0)}`,
  );
}

console.log(
  `\n${drifted} holding(s) whose stored basis would move on first correction · ${broken} unreplayable`,
);
if (drifted === 0 && broken === 0) console.log("✓ The fold agrees with every stored figure.");
process.exit(0);
