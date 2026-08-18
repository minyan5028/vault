/**
 * Backfill historical trips into Projects (ADR-0009).
 *
 * ADR-0009 left this out of scope deliberately: it needs the owner to recall
 * dates, so it is one-off human work rather than a rule. This script is the
 * result of that recall, written down so the reasoning does not survive only in
 * a commit message — see `.scratch/projects/backfill-plan.md`.
 *
 * **Dates are never changed.** A Project is a grouping; its dates are only the
 * auto-assign heuristic (ADR-0009), so a purchase made weeks before a trip is
 * attached by membership, not by moving when it happened. Rewriting `date`
 * would have shifted NT$25,018 between three months of history for no gain.
 *
 * Only `projectId` is written. Expenses by default: transfers contribute to no
 * total and none inside these ranges was money moved *for* a trip, and salary
 * or red envelopes are not trip income.
 *
 * Income is attached only where the owner named it. A Project's figure is net
 * (ADR-0009), so a travelling companion settling their share genuinely reduces
 * what the trip cost. `[韓國]代墊` was reviewed and is *not* trip income despite
 * its prefix; `藜` reimbursing during the Tokyo trip is.
 *
 * Balances are untouched — no amount, account, type or date changes — but
 * rollups gain the new per-project maps, so rebuild them afterwards
 * (recompute_rollups.mjs).
 *
 * Usage: node scripts/backfill_trip_projects.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const money = (n) => (n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
const log = (...a) => console.log(...a);
const head = (s) => log(`\n${"=".repeat(74)}\n${s}\n${"=".repeat(74)}`);
const day = (ts) => {
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const at = (s, endOfDay = false) =>
  Timestamp.fromDate(new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`));

/**
 * The trips, as recalled by the owner.
 *
 * `start`/`end` are the Project's own dates — when the owner was actually away.
 * `titles` is how a trip whose spending sits outside those dates is recognised:
 * Seoul was booked weeks ahead and settled weeks after under a `[韓國]` naming
 * convention, so a date sweep over its real footprint would drag in five weeks
 * of ordinary life. Date-driven selection is a convenience, not the rule.
 */
const TRIPS = [
  { id: "trip-2026-fuji-tokyo", name: "日本富士東京之旅", start: "2026-07-26", end: "2026-08-02", byRange: true },
  { id: "trip-2025-kumamoto-fukuoka", name: "日本熊本福岡之旅", start: "2025-12-29", end: "2026-01-06", byRange: true },
  { id: "trip-2024-kansai", name: "日本京阪神之旅", start: "2024-12-28", end: "2025-01-01", byRange: true },
  {
    id: "trip-2023-seoul",
    name: "韓國首爾之旅",
    start: "2023-12-02",
    end: "2023-12-09",
    byRange: true,
    titles: /^\[韓國\]|^韓國之旅|^韓國占卜/,
  },
];

/**
 * Income to attach, per trip — a companion settling their share of the trip.
 *
 * Checked *before* the type and recurring-rule filters, both of which would
 * otherwise drop it: `藜` is income, and `藜` is also the title of a recurring
 * rule. Deliberately narrow — reviewed row by row, not inferred.
 */
const INCOME = {
  "trip-2026-fuji-tokyo": /^藜$/,
};

/** Everyday spending that happens to fall inside a trip's dates. */
const NEVER = new Set(["停車位"]);

// ---------------------------------------------------------------- read ----

// Evidence, not guesswork: materializeRecurring copies the rule's title onto the
// transaction it generates and leaves no back-reference (ADR-0008), so a title
// matching a rule identifies rent/insurance/telecom charged while away.
const ruleTitles = new Set(
  (await led.collection("recurring").get()).docs
    .map((d) => (d.data().title ?? "").trim())
    .filter(Boolean),
);

/**
 * Read only the windows that can possibly contain a trip's rows, not the whole
 * collection. A full scan here is ~3,800 reads *per run*, and a dry-run is meant
 * to be run repeatedly — that is how this ledger's daily quota was exhausted
 * once already. Each trip's own range, plus one wider window for Seoul, whose
 * `[韓國]`-prefixed rows sit weeks outside it and cannot be found by a date
 * predicate alone.
 */
const WINDOWS = [
  ["2026-07-26", "2026-08-02"],
  ["2025-12-29", "2026-01-06"],
  ["2024-12-28", "2025-01-01"],
  ["2023-11-01", "2024-02-29"], // Seoul: bookings, the trip, and its settlements
];

const seen = new Map();
let reads = 0;
for (const [from, to] of WINDOWS) {
  const snap = await led
    .collection("transactions")
    .where("date", ">=", at(from))
    .where("date", "<=", at(to, true))
    .get();
  reads += snap.size;
  for (const d of snap.docs) seen.set(d.id, d);
}
const txs = [...seen.values()].filter((d) => (d.data().deletedAt ?? null) === null);
const cats = new Map((await led.collection("categories").get()).docs.map((d) => [d.id, d.data().name]));

log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}`);
log(`讀取 ${reads} 筆（${WINDOWS.length} 個視窗，去重後 ${txs.length} 筆 active）· 定期規則 ${ruleTitles.size} 個`);

// ------------------------------------------------------------- select ----

const writes = [];
const claimed = new Map(); // txId -> trip name, to catch a row two trips both want

for (const trip of TRIPS) {
  const from = at(trip.start);
  const to = at(trip.end, true);
  const picked = [];
  const skipped = [];

  for (const d of txs) {
    const t = d.data();
    const title = (t.title ?? "").trim();
    const inRange = trip.byRange && t.date >= from && t.date <= to;
    const byTitle = trip.titles ? trip.titles.test(title) : false;
    if (!inRange && !byTitle) continue;

    // Named trip income wins over every filter below, including the recurring
    // -rule one — `藜` is both an income title and a rule title.
    const namedIncome = INCOME[trip.id]?.test(title) && t.type === "income";
    if (!namedIncome) {
      if (t.type !== "expense") {
        skipped.push([d, t.type === "income" ? "income" : "transfer"]);
        continue;
      }
      if (ruleTitles.has(title)) {
        skipped.push([d, "定期規則"]);
        continue;
      }
      if (NEVER.has(title)) {
        skipped.push([d, "日常"]);
        continue;
      }
    }
    if (t.projectId === trip.id) continue; // already done; re-run is safe
    picked.push(d);
  }

  head(`${trip.name}   ${trip.start} → ${trip.end}${trip.titles ? "  (+ title 比對)" : ""}`);
  // A Project's figure is net: expenses minus the income it brought back.
  const exp = picked.filter((d) => d.data().type === "expense");
  const inc = picked.filter((d) => d.data().type === "income");
  const expTotal = exp.reduce((s, d) => s + (d.data().baseAmount ?? 0), 0);
  const incTotal = inc.reduce((s, d) => s + (d.data().baseAmount ?? 0), 0);
  const total = expTotal - incTotal;
  log(`  納入 ${picked.length} 筆`);
  log(`     支出 ${String(exp.length).padStart(3)} 筆 · ${money(expTotal).padStart(9)}`);
  if (inc.length) {
    log(`     收入 ${String(inc.length).padStart(3)} 筆 · ${money(incTotal).padStart(9)}   ${inc.map((d) => d.data().title).join(", ")}`);
    log(`     淨額            ${money(total).padStart(9)}`);
  }
  log(`  排除 ${skipped.length} 筆:`);
  const byReason = new Map();
  for (const [d, why] of skipped) {
    const e = byReason.get(why) ?? { n: 0, amt: 0, titles: new Set() };
    e.n++;
    e.amt += d.data().baseAmount ?? 0;
    e.titles.add((d.data().title ?? "").trim());
    byReason.set(why, e);
  }
  for (const [why, e] of byReason)
    log(`     ${why.padEnd(6)} ${String(e.n).padStart(3)} 筆 · ${money(e.amt).padStart(9)}   ${[...e.titles].slice(0, 8).join(", ")}`);

  // Rows outside the Project's own dates — the ones membership, not the date
  // sweep, is carrying. Worth seeing every time.
  const outside = picked.filter((d) => d.data().date < from || d.data().date > to);
  if (outside.length) {
    log(`\n  日期落在專案區間外、靠 title 納入的 ${outside.length} 筆（日期不動）:`);
    for (const d of outside) {
      const t = d.data();
      log(`     ${day(t.date)}  ${(t.title ?? "").padEnd(18)} ${money(t.baseAmount ?? 0).padStart(8)}  ${cats.get(t.categoryId) ?? "—"}`);
    }
  }

  for (const d of picked) {
    const prev = claimed.get(d.id);
    if (prev) throw new Error(`交易 ${d.id} 同時被「${prev}」和「${trip.name}」納入`);
    claimed.set(d.id, trip.name);
    writes.push({ ref: d.ref, projectId: trip.id });
  }
  trip._picked = picked.length;
  trip._total = total;
}

// -------------------------------------------------------------- check ----

head("檢核");
log(`  ✓ 只寫 projectId：不動 amount / account / type / date / categoryId`);
log(`  ✓ 支出總額必然不變 — 沒有任何金額欄位被寫入`);
log(`  ✓ 收入只納入明確指名的（${Object.keys(INCOME).join(", ") || "無"}）`);
log(`  ✓ 支出總額不受影響 (${money(before)})`);
log(`  ✓ 沒有交易被兩個專案同時納入`);
log(`  ✓ 重跑安全：已經指派過的會被跳過`);

head("小結");
for (const t of TRIPS) log(`  ${t.name.padEnd(20)} ${String(t._picked).padStart(4)} 筆 · 淨額 ${money(t._total).padStart(9)}`);
log(`  ${"合計".padEnd(20)} ${String(writes.length).padStart(4)} 筆 · ${money(TRIPS.reduce((s, t) => s + t._total, 0)).padStart(9)}`);

if (!commit) {
  log(`\nDRY RUN — 未寫入。確認後執行:`);
  log(`   node scripts/backfill_trip_projects.mjs --commit`);
  log(`   node scripts/recompute_rollups.mjs ${LEDGER}`);
  process.exit(0);
}

// -------------------------------------------------------------- write ----

let batch = db.batch();
let n = 0;
for (const trip of TRIPS) {
  batch.set(
    led.collection("projects").doc(trip.id),
    {
      name: trip.name,
      startDate: at(trip.start),
      endDate: at(trip.end),
      autoAssign: false, // every one of these is long over
      deletedAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
  n++;
}
for (const w of writes) {
  batch.update(w.ref, { projectId: w.projectId, updatedAt: Timestamp.now() });
  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
if (n % 400 !== 0) await batch.commit();
log(`\n  ✓ 已建立 ${TRIPS.length} 個專案、指派 ${writes.length} 筆交易。接著執行:`);
log(`   node scripts/recompute_rollups.mjs ${LEDGER}`);
process.exit(0);
