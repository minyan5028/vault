/**
 * Repair the Dream account after the 2026-08-01 balance-rollup wipe.
 *
 * Three independent defects were found (see the diagnosis in the 2026-08-03
 * session); this script fixes the two *data* ones. The wiped rollup itself is
 * rebuilt afterwards by recompute_balances.mjs, which derives netFlow from the
 * transactions this script has already corrected.
 *
 *   1. Double-booked telecom bills (2026-07): the recurring rules generated
 *      中華電信網路費 / 手機費 and the same two were also entered by hand.
 *      The hand-entered copies are soft-deleted; the recurring ones (whose
 *      deterministic `ruleId_date` ids stay traceable) survive.
 *   2. Salary mis-posting (2026-06, 2026-07): the Investment envelope's 5,155
 *      salary allotment was booked to `dream` instead of `investment` in both
 *      months. Re-pointed at `investment`. Amounts and dates are untouched, so
 *      income totals and the month rollups' income figure are unchanged.
 *
 * Rollups are NOT adjusted here — writing outside transactionRepo means the
 * increments would be wrong. Run the two recompute scripts afterwards.
 *
 * Usage: node scripts/fix_dream_2026_08.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const money = (n) => (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const log = (...a) => console.log(...a);
const head = (s) => log(`\n${"=".repeat(70)}\n${s}\n${"=".repeat(70)}`);

/** Hand-entered duplicates of a recurring-generated bill (2026-07). */
const DUPLICATES = [
  { id: "fM3XlwoxW8TfcOHYK0Rx", keeps: "jpLO7qXZlCegLslpCkn2_2026-07-15", label: "中華電信網路費" },
  { id: "FnQ6ZyIKBQXl9TbYCx0b", keeps: "8ZZOpvCHKoJRGvjFmEYo_2026-07-15", label: "中華電信手機費" },
];

/** The mis-posted salary allotment: dream -> investment, 5,155 in these months. */
const MISPOST = { amount: 515500, from: "dream", to: "investment", months: ["2026-06", "2026-07"] };

const txSnap = await led.collection("transactions").get();
const byId = new Map(txSnap.docs.map((d) => [d.id, d]));
log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER} · ${txSnap.size} transactions`);

const writes = [];

// ------------------------------------------------------- 1. duplicates ----

head("1. 軟刪重複記帳（保留 recurring 產生的版本）");
for (const dup of DUPLICATES) {
  const d = byId.get(dup.id);
  const keep = byId.get(dup.keeps);
  if (!d) throw new Error(`找不到要刪的交易 ${dup.id}`);
  if (!keep) throw new Error(`找不到要保留的交易 ${dup.keeps}`);
  const t = d.data(), k = keep.data();
  if (t.deletedAt) {
    log(`  已刪除，跳過: ${dup.id}`);
    continue;
  }
  // Guard: the two must really be the same event.
  const same = t.amount === k.amount && t.accountId === k.accountId && t.type === k.type;
  if (!same) throw new Error(`${dup.id} 與 ${dup.keeps} 內容不一致，中止`);
  log(`  × 軟刪 ${dup.label.padEnd(16)} ${money(t.amount).padStart(10)} ${t.accountId}  {${dup.id}}`);
  log(`    保留 ${"".padEnd(16)} ${money(k.amount).padStart(10)} ${k.accountId}  {${dup.keeps}}`);
  writes.push({ ref: d.ref, data: { deletedAt: Timestamp.now(), updatedAt: Timestamp.now() } });
}

// --------------------------------------------------- 2. mis-posted salary ----

head("2. 薪資撥款改回 Investment 帳戶");
const misposted = txSnap.docs.filter((d) => {
  const t = d.data();
  return (
    !t.deletedAt &&
    t.type === "income" &&
    t.categoryId === "salary" &&
    t.accountId === MISPOST.from &&
    t.amount === MISPOST.amount &&
    MISPOST.months.includes(t.yearMonth)
  );
});
if (misposted.length !== MISPOST.months.length)
  throw new Error(`預期 ${MISPOST.months.length} 筆錯帳交易，實際找到 ${misposted.length} 筆，中止`);
for (const d of misposted) {
  const t = d.data();
  log(
    `  ~ ${t.yearMonth} ${t.date.toDate().toISOString().slice(0, 10)} ${money(t.amount).padStart(10)}`,
    `${MISPOST.from} → ${MISPOST.to}  "${t.title}"  {${d.id}}`,
  );
  writes.push({ ref: d.ref, data: { accountId: MISPOST.to, updatedAt: Timestamp.now() } });
}

// ------------------------------------------------------------- 3. effect ----

head("3. 對 Dream 淨流的影響");
const dupSum = DUPLICATES.reduce((s, x) => s + (byId.get(x.id)?.data().deletedAt ? 0 : byId.get(x.id).data().amount), 0);
const misSum = misposted.length * MISPOST.amount;
log(`  刪除重複支出      dream ${money(dupSum).padStart(12)}  (餘額回升)`);
log(`  薪資改記 investment dream ${money(-misSum).padStart(12)}  (餘額下降)`);
log(`  ${"".padEnd(18)}${"—".repeat(14)}`);
log(`  Dream 淨變動      ${money(dupSum - misSum).padStart(20)}`);
log(`  Investment 淨變動 ${money(misSum).padStart(20)}`);

// -------------------------------------------------------------- 4. write ----

head(`4. 寫入 (${writes.length} 筆)`);
if (!commit) {
  log("  DRY RUN — 未寫入。確認無誤後執行:");
  log("    node scripts/fix_dream_2026_08.mjs --commit");
  log("    node scripts/recompute_balances.mjs --commit");
  log(`    node scripts/recompute_rollups.mjs ${LEDGER}`);
} else {
  const batch = db.batch();
  for (const w of writes) batch.update(w.ref, w.data);
  await batch.commit();
  log(`  ✓ 已寫入 ${writes.length} 筆。接著必須執行（rollup 尚未同步）:`);
  log("    node scripts/recompute_balances.mjs --commit");
  log(`    node scripts/recompute_rollups.mjs ${LEDGER}`);
}
process.exit(0);
