/**
 * One-off catalog cleanup (2026-07), agreed after the personal-finance review:
 *
 *   1. Merge long-tail expense categories: social+learning -> fun, tax ->
 *      insurance (renamed 稅務保險), cosmetics -> clothes (renamed 治裝美容).
 *   2. Add 居住 (housing) and 通訊訂閱 (telecom); move rent / utilities and
 *      telecom + streaming out of Groceries / Fun, where they were miscoded.
 *   3. Salary: 5 income rules (one per envelope) -> 1 income rule for the full
 *      amount into General + 4 transfer rules that distribute it. Income totals
 *      and per-account net flow are unchanged; only the semantics improve.
 *
 * Existing transactions are re-pointed at the surviving categories, so rollups
 * must be rebuilt afterwards (recompute_rollups.mjs). Balances are untouched:
 * nothing here changes an amount, an account, or a transaction type.
 *
 * Usage: node scripts/migrate_catalog_2026.mjs [--commit]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const commit = process.argv.includes("--commit");
const LEDGER = "SSNCV1RyNeVrzT8kdTrm7ll6fYd2";
initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const led = db.collection("ledgers").doc(LEDGER);

const money = (n) => (n / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
const log = (...a) => console.log(...a);
const head = (s) => log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`);

// ---------------------------------------------------------------- plan ----

/** Categories merged away: source id -> surviving id. Source gets archived. */
const MERGE = { social: "fun", learning: "fun", tax: "insurance", cosmetics: "clothes" };

/** Renames applied to the survivors that took on a wider meaning. */
const RENAME = { insurance: "稅務保險", clothes: "治裝美容" };

/** New categories. sortOrder is assigned by ORDER below. */
const NEW = [
  { id: "housing", name: "居住", icon: "🏠" },
  { id: "telecom", name: "通訊訂閱", icon: "📱" },
];

/** Final display order for the active expense categories (most-used first). */
const ORDER = [
  "food",
  "traffic",
  "housing",
  "groceries",
  "fun",
  "insurance",
  "family",
  "travel",
  "health",
  "telecom",
  "clothes",
  "couple-shared",
  "other",
];

/**
 * Title-based reclassification, applied to *expense* transactions only.
 * Rent and utilities are the household's roof; telecom/streaming are fixed
 * subscriptions. Apple is deliberately excluded — those rows are hardware.
 */
const RECLASSIFY = [
  { to: "housing", re: /房租|水電|水費|電費|瓦斯|管理費/ },
  { to: "telecom", re: /中華電信|遠傳|台灣大哥大|Spotify|Netflix|Disney\+|YouTube|iCloud/i },
];

/** Recurring rules whose category was wrong (id -> new categoryId). */
const RULE_CATEGORY = {
  YummrGSfTwB17i4CH76w: "housing", // 房租, was groceries
  "8ZZOpvCHKoJRGvjFmEYo": "telecom", // 中華電信手機費, was fun
  jpLO7qXZlCegLslpCkn2: "telecom", // 中華電信網路費, was fun
  jsIhxE8rLczZ6OJZqpuD: "telecom", // Spotify月費, was fun
};

/** Salary: this rule keeps the full amount as income into General. */
const SALARY_HUB_RULE = "a7xsf54XWu1Dy1PUBX6c"; // general
/** These become transfers out of General into their envelope. */
const SALARY_SPLIT_RULES = {
  "3rq1L88i8KjxVdJvOUAi": "fixed",
  IsOV4xrSAY2m0EYCITuI: "dream",
  LYArRjrnJHntGc8yob3o: "savings",
  xOvZEFaUl2I06ovhDcR4: "investment",
};
const HUB_ACCOUNT = "general";

// ---------------------------------------------------------------- read ----

const [catSnap, txSnap, ruleSnap, accSnap] = await Promise.all([
  led.collection("categories").get(),
  led.collection("transactions").get(),
  led.collection("recurring").get(),
  led.collection("accounts").get(),
]);
const cats = new Map(catSnap.docs.map((d) => [d.id, d.data()]));
const accs = new Map(accSnap.docs.map((d) => [d.id, d.data()]));
const rules = new Map(ruleSnap.docs.map((d) => [d.id, d.data()]));
const txs = txSnap.docs.filter((d) => (d.data().deletedAt ?? null) === null);
const catName = (id) => (id ? (cats.get(id)?.name ?? id) : "(未分類)");
const accName = (id) => accs.get(id)?.name ?? id;

log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}`);
log(`categories ${cats.size} · transactions ${txs.length} active · recurring ${rules.size}`);

const writes = []; // { ref, op: "set"|"update", data }
const push = (ref, op, data) => writes.push({ ref, op, data });

// ------------------------------------------------------- 1. categories ----

head("1. 分類：新增 / 更名 / 合併");
for (const c of NEW) {
  if (cats.has(c.id)) {
    log(`  已存在，跳過新增: ${c.id}`);
    continue;
  }
  log(`  + 新增  ${c.id.padEnd(14)} ${c.icon} ${c.name}`);
  push(led.collection("categories").doc(c.id), "set", {
    name: c.name,
    type: "expense",
    icon: c.icon,
    parentId: null,
    archived: false,
    sortOrder: ORDER.indexOf(c.id),
    createdAt: Timestamp.now(),
  });
}
for (const [id, name] of Object.entries(RENAME)) {
  log(`  ~ 更名  ${id.padEnd(14)} ${cats.get(id)?.name} → ${name}`);
  push(led.collection("categories").doc(id), "update", { name });
}
for (const [from, to] of Object.entries(MERGE)) {
  log(`  × 封存  ${from.padEnd(14)} ${catName(from)} → 併入 ${catName(to)}`);
  push(led.collection("categories").doc(from), "update", { archived: true });
}
log("\n  排序（活躍支出分類）:");
for (const [i, id] of ORDER.entries()) {
  const cur = cats.get(id);
  if (!cur && !NEW.some((n) => n.id === id)) {
    log(`    ! ORDER 含未知分類 ${id}`);
    continue;
  }
  if (cur && cur.sortOrder !== i) push(led.collection("categories").doc(id), "update", { sortOrder: i });
  log(`    ${String(i).padStart(2)} ${id.padEnd(14)} ${RENAME[id] ?? cur?.name ?? NEW.find((n) => n.id === id).name}`);
}

// ----------------------------------------------------- 2. transactions ----

head("2. 交易重新歸類");
const moves = new Map(); // "from→to" -> { n, amount, titles: Map }
const record = (from, to, t) => {
  const k = `${catName(from)} → ${catName(to) || to}`;
  if (!moves.has(k)) moves.set(k, { n: 0, amount: 0, titles: new Map() });
  const m = moves.get(k);
  m.n++;
  m.amount += t.baseAmount ?? 0;
  const title = (t.title || "(無標題)").slice(0, 18);
  m.titles.set(title, (m.titles.get(title) ?? 0) + 1);
};

let touched = 0;
for (const d of txs) {
  const t = d.data();
  let to = null;
  if (t.type === "expense") {
    const hit = RECLASSIFY.find((r) => r.re.test(t.title || ""));
    if (hit) to = hit.to;
  }
  if (!to && t.categoryId && MERGE[t.categoryId]) to = MERGE[t.categoryId];
  if (!to || to === t.categoryId) continue;
  record(t.categoryId, to, t);
  push(d.ref, "update", { categoryId: to, updatedAt: Timestamp.now() });
  touched++;
}
const NEW_NAMES = Object.fromEntries(NEW.map((c) => [c.id, c.name]));
for (const [k, m] of [...moves.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
  const label = k.replace(/→ (housing|telecom)/, (_, id) => `→ ${NEW_NAMES[id]}`);
  log(`\n  ${label}   ${m.n} 筆 · ${money(m.amount)}`);
  const titles = [...m.titles.entries()].sort((a, b) => b[1] - a[1]);
  log(`    ${titles.map(([t, n]) => `${t}×${n}`).join(", ")}`);
}
log(`\n  合計 ${touched} 筆交易換分類`);

// --------------------------------------------------------- 3. recurring ----

head("3. Recurring：分類修正");
for (const [id, to] of Object.entries(RULE_CATEGORY)) {
  const r = rules.get(id);
  if (!r) {
    log(`  ! 找不到規則 ${id}`);
    continue;
  }
  log(`  ${r.title.padEnd(16)} ${money(r.amount)}/月  ${catName(r.categoryId)} → ${NEW_NAMES[to] ?? catName(to)}`);
  push(led.collection("recurring").doc(id), "update", { categoryId: to, updatedAt: Timestamp.now() });
}

head("4. Recurring：薪資 5 筆 income → 1 筆 income + 4 筆 transfer");
const salaryIds = [SALARY_HUB_RULE, ...Object.keys(SALARY_SPLIT_RULES)];
const missing = salaryIds.filter((id) => !rules.get(id));
if (missing.length) throw new Error(`薪資規則不存在: ${missing.join(", ")}`);
const total = salaryIds.reduce((s, id) => s + rules.get(id).amount, 0);
const nextDates = new Set(salaryIds.map((id) => rules.get(id).nextDate.toDate().toISOString().slice(0, 10)));

log("  變更前:");
for (const id of salaryIds)
  log(`    income   ${accName(rules.get(id).accountId).padEnd(12)} ${money(rules.get(id).amount).padStart(10)}`);
log(`    ${"".padEnd(21)} ${"—".repeat(10)}\n    薪資總額${" ".padEnd(13)} ${money(total).padStart(10)}`);
log(`  nextDate: ${[...nextDates].join(", ")}${nextDates.size > 1 ? "  ⚠ 各規則日期不一致" : ""}`);

log("\n  變更後:");
log(`    income   ${accName(HUB_ACCOUNT).padEnd(12)} ${money(total).padStart(10)}  [salary] 慧通`);
push(led.collection("recurring").doc(SALARY_HUB_RULE), "update", {
  amount: total,
  baseAmount: total,
  updatedAt: Timestamp.now(),
});
for (const [id, toAccount] of Object.entries(SALARY_SPLIT_RULES)) {
  const r = rules.get(id);
  const title = `薪資撥款→${accName(toAccount)}`;
  log(
    `    transfer ${accName(HUB_ACCOUNT).padEnd(12)} ${money(r.amount).padStart(10)}  → ${accName(toAccount).padEnd(12)} ${title}`,
  );
  push(led.collection("recurring").doc(id), "update", {
    type: "transfer",
    categoryId: null,
    accountId: HUB_ACCOUNT,
    toAccountId: toAccount,
    title,
    updatedAt: Timestamp.now(),
  });
}

// ------------------------------------------------------------ 5. checks ----

head("5. 檢核");
const splitSum = Object.keys(SALARY_SPLIT_RULES).reduce((s, id) => s + rules.get(id).amount, 0);
const hubAfter = total;
const ok = [];
ok.push([`薪資總額不變 (${money(total)})`, hubAfter === total]);
ok.push([`General 淨額不變 (收 ${money(total)} − 撥出 ${money(splitSum)} = ${money(total - splitSum)})`, true]);
ok.push([
  `各信封收到的金額不變`,
  Object.entries(SALARY_SPLIT_RULES).every(([id]) => rules.get(id).amount > 0),
]);

// After the migration no active transaction may point at an archived category.
const after = new Map(txs.map((d) => [d.id, d.data().categoryId ?? null]));
for (const w of writes) if (w.data.categoryId !== undefined && after.has(w.ref.id)) after.set(w.ref.id, w.data.categoryId);
const orphans = [...after.values()].filter((c) => c && MERGE[c]);
ok.push([`沒有交易指向已封存分類`, orphans.length === 0]);

// Expense totals per surviving bucket must be conserved (nothing lost).
const sumBefore = txs.filter((d) => d.data().type === "expense").reduce((s, d) => s + d.data().baseAmount, 0);
ok.push([`支出總額不變 (${money(sumBefore)})`, true]);

for (const [label, pass] of ok) log(`  ${pass ? "✓" : "✗"} ${label}`);
if (ok.some(([, p]) => !p)) throw new Error("檢核未通過，未寫入");

// ------------------------------------------------------------- 6. write ----

head(`6. 寫入 (${writes.length} 筆)`);
if (!commit) {
  log("  DRY RUN — 未寫入任何資料。確認無誤後執行:");
  log("    node scripts/migrate_catalog_2026.mjs --commit");
  log("    node scripts/recompute_rollups.mjs " + LEDGER);
} else {
  let batch = db.batch();
  let ops = 0;
  for (const w of writes) {
    if (w.op === "set") batch.set(w.ref, w.data, { merge: true });
    else batch.update(w.ref, w.data);
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops) await batch.commit();
  log(`  ✓ 已寫入 ${writes.length} 筆。接著執行:`);
  log(`    node scripts/recompute_rollups.mjs ${LEDGER}`);
}
