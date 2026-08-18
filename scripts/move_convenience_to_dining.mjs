/**
 * Move convenience-store spending out of 食材採買 (fresh) back into 外食 (food).
 *
 * `migrate_catalog_2026_08.mjs` routes grocery-chain titles out of 外食 into
 * 食材採買 via one `CHAIN` regex, and that regex lumps 7-11 / 全家 in with
 * Costco and 全聯. They are not the same purchase: the average convenience-store
 * row here is NT$91, which is a drink and a rice ball, not a grocery run.
 *
 * The consequence is not cosmetic. ADR-0008 puts 外食 in 可選消費 and 食材採買
 * in 必要變動, so every one of these rows is currently counted as unavoidable
 * spending. It also understates the one figure the ADR exists to make
 * actionable — "外食 is N/mo".
 *
 * These rows were filed under Food by the owner at the time and moved by the
 * migration, so this restores the original filing rather than imposing a new
 * judgement — which is exactly the evidence ADR-0008 says to trust.
 *
 * Balances are untouched: no amount, account or transaction type changes, and
 * the expense total is asserted to be conserved. Rollups must be rebuilt
 * afterwards (recompute_rollups.mjs) because category totals move.
 *
 * Usage: node scripts/move_convenience_to_dining.mjs [--commit]
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

const FROM = "fresh"; // 食材採買
const TO = "food"; // 外食

/** Convenience stores only. 全聯 / Costco / 家樂福 / 美廉社 stay put — those are
 *  genuine grocery runs and belong where the migration put them. */
const CONVENIENCE = /7-?11|統一超商|全家|萊爾富|OK超商|OK便利/;

log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}`);

// Server-side filter: only the category in question, not the whole ledger.
const snap = await led.collection("transactions").where("categoryId", "==", FROM).get();
const rows = snap.docs.filter((d) => (d.data().deletedAt ?? null) === null);
const moving = rows.filter((d) => CONVENIENCE.test(d.data().title ?? ""));

const by = new Map();
for (const d of moving) {
  const t = d.data();
  const k = t.title ?? "(無標題)";
  const e = by.get(k) ?? { n: 0, amt: 0 };
  e.n++;
  e.amt += t.baseAmount ?? 0;
  by.set(k, e);
}

const freshTotal = rows.reduce((s, d) => s + (d.data().baseAmount ?? 0), 0);
const movingTotal = moving.reduce((s, d) => s + (d.data().baseAmount ?? 0), 0);
const months = new Set(rows.map((d) => d.data().yearMonth)).size;

log(`\n讀取 ${snap.size} 筆 (categoryId == "${FROM}")，其中未刪除 ${rows.length} 筆 · ${money(freshTotal)}`);
log(`\n要移動的 ${moving.length} 筆 · ${money(movingTotal)}  →  ${TO}`);
for (const [k, v] of [...by].sort((a, b) => b[1].amt - a[1].amt))
  log(`   ${k.padEnd(14)} ${String(v.n).padStart(4)} 筆 · ${money(v.amt).padStart(9)}`);

log(`\n月均影響 (${months} 個月):`);
log(`   食材採買  −${money(movingTotal / months)}/月   [必要變動]`);
log(`   外食      +${money(movingTotal / months)}/月   [可選消費]`);

// Assertions before anything is written.
if (moving.some((d) => d.data().type !== "expense")) throw new Error("非支出的交易被選中");
const stays = rows.filter((d) => !CONVENIENCE.test(d.data().title ?? ""));
if (stays.reduce((s, d) => s + (d.data().baseAmount ?? 0), 0) + movingTotal !== freshTotal)
  throw new Error("金額不守恆");
log(`\n  ✓ 全部是 expense；移動的與留下的金額合計等於原本的 ${money(freshTotal)}`);

if (!commit) {
  log(`\nDRY RUN — 未寫入。確認後執行:`);
  log(`   node scripts/move_convenience_to_dining.mjs --commit`);
  log(`   node scripts/recompute_rollups.mjs ${LEDGER}`);
  process.exit(0);
}

let batch = db.batch();
let n = 0;
for (const d of moving) {
  batch.update(d.ref, { categoryId: TO, updatedAt: Timestamp.now() });
  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
if (n % 400 !== 0) await batch.commit();
log(`\n  ✓ 已寫入 ${moving.length} 筆。接著執行:`);
log(`   node scripts/recompute_rollups.mjs ${LEDGER}`);
process.exit(0);
