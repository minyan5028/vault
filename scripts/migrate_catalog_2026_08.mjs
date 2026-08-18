/**
 * Catalog migration 2026-08 — expense taxonomy by compressibility (ADR-0008).
 *
 *   1. Reuse three category ids under new names (food→外食, groceries→日用品,
 *      traffic→車輛) and add two (食材採買, 家居). Reuse always runs with the
 *      larger half, so most rows never move.
 *   2. Converge titles: one merchant, one title. Item detail moves from the
 *      title into `note`, which is where ADR-0008 says it belongs.
 *   3. Re-point the rows the rename cannot cover: grocery chains out of 外食,
 *      public transport out of 車輛, 停車位/車險 out of 稅務保險, income tax out
 *      of Other, durables out of 日用品.
 *   4. Reimbursements from 藜 become `refund` income instead of `income-other` —
 *      they offset expenses, they are not earnings.
 *
 * Sort order encodes manual-entry frequency, not the ADR-0008 bands (see that
 * ADR's 2026-08-18 amendment): its only consumers are the Quick Entry category
 * grid and the Manage list, and Quick Entry preselects whichever category sorts
 * first. The bands remain documentation, printed below but never stored.
 *
 * Balances are untouched: nothing here changes an amount, an account or a
 * transaction type. Rollups must be rebuilt afterwards (recompute_rollups.mjs).
 *
 * Usage: node scripts/migrate_catalog_2026_08.mjs [--commit]
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
const head = (s) => log(`\n${"=".repeat(76)}\n${s}\n${"=".repeat(76)}`);

// ---------------------------------------------------------------- plan ----

/** Ids kept, relabelled. An id is an identifier, not a label (ADR-0008). */
const RENAME = { food: "外食", groceries: "日用品", traffic: "車輛" };

/** Split out of the categories above. */
const NEW = [
  { id: "fresh", name: "食材採買", icon: "🥬" },
  { id: "home", name: "家居", icon: "🛋️" },
];

/** Band membership per ADR-0008. Reported in the dry-run below; never stored,
 *  and no longer the display order. */
const BANDS = {
  固定義務: ["traffic", "housing", "insurance", "family", "telecom"],
  必要變動: ["fresh", "health", "groceries"],
  可選消費: ["fun", "food", "clothes", "travel", "home", "couple-shared", "other"],
};

/**
 * Display order = how often the category is typed by hand, most-typed first.
 * The categories that arrive through `materializeRecurring` (居住, 稅務保險,
 * 通訊訂閱) sit at the back precisely because they are never typed at all.
 */
const ORDER = [
  "food",      // 外食 — near-daily
  "fresh",     // 食材採買
  "groceries", // 日用品
  "fun",       // Fun
  "health",    // Health
  "traffic",   // 車輛 — high value, low count: refuelling, servicing
  "travel",    // Travel
  "clothes",   // 治裝美容
  "home",      // 家居
  "family",    // Family
  "housing",   // 居住 ─┐
  "insurance", // 稅務保險 ├ recurring rules; never hand-entered
  "telecom",   // 通訊訂閱 ─┘
  "couple-shared",
  "other",
];
const bandOf = (id) => Object.keys(BANDS).find((b) => BANDS[b].includes(id)) ?? "—";

// The two lists must describe the same catalog; a category present in one and
// missing from the other would silently get sortOrder -1 or no band.
{
  const banded = Object.values(BANDS).flat();
  const missing = banded.filter((id) => !ORDER.includes(id));
  const extra = ORDER.filter((id) => !banded.includes(id));
  if (missing.length || extra.length)
    throw new Error(`BANDS/ORDER 不一致 — 缺 ${missing.join(",") || "—"} / 多 ${extra.join(",") || "—"}`);
}

/**
 * Title convergence. `to` is the merchant/payee; `note` is what was bought and
 * is only written when the row has no note of its own.
 */
const TITLE = {
  // Policies. "保費" describes the transaction, not the payee.
  失能險保費: { to: "國泰長照險" }, // same policy as 國泰長照險 — 13,741, every September
  國泰醫療險保費: { to: "國泰醫療險" },
  富邦醫療險保費: { to: "富邦醫療險" },
  汽車保費: { to: "國泰汽車險" },
  國泰汽車保費: { to: "國泰汽車險" },
  國泰保費: { to: "國泰汽車險" },
  "機車保費(2025/11)": { to: "機車險", note: "2025/11" },
  // Parking, fuel, servicing.
  "2024汽車停車位": { to: "停車位" },
  加油: { to: "加油費" },
  汽車加油: { to: "加油費" },
  汽車加油Other: { to: "加油費" },
  燃料費: { to: "燃料稅" },
  汽車燃料費: { to: "燃料稅" },
  機車燃料費: { to: "燃料稅", note: "機車" },
  今冠奕機車行: { to: "今冠機車行" },
  // Utilities and telecom.
  電費: { to: "水電費", note: "電費" },
  水電: { to: "水電費" },
  網路費: { to: "中華電信網路費" },
  手機費: { to: "中華電信手機費" },
  // Transport operators are distinct merchants; only strip the annotations.
  "新竹客運(來回*2": { to: "新竹客運", note: "來回×2" },
  "新竹台北來回(豪泰)": { to: "豪泰客運", note: "新竹→台北 來回" },
  "新竹台北(亞聯)": { to: "亞聯客運", note: "新竹→台北" },
  台鐵花蓮台北: { to: "台鐵", note: "花蓮→台北" },
  // Costco: seven titles for one merchant.
  Costco食材: { to: "Costco", note: "食材" },
  CostcoFood: { to: "Costco", note: "食材" },
  Costco蛋白粉: { to: "Costco", note: "蛋白粉" },
  Costco牛肋條: { to: "Costco", note: "牛肋條" },
  CostcoD3: { to: "Costco", note: "D3" },
  Costco黑鑽卡: { to: "Costco", note: "黑鑽卡會員年費" },
  Costco熱狗: { to: "Costco", note: "熱狗" },
  全聯Food: { to: "全聯" },
  // Red envelopes: the recipient is the note, not the title.
  "紅包(媽)": { to: "紅包", note: "媽" },
  "紅包(阿嬤)": { to: "紅包", note: "阿嬤" },
  "紅包(哥)": { to: "紅包", note: "哥" },
  "紅包(爸)": { to: "紅包", note: "爸" },
  "紅包(藜同事婚禮": { to: "紅包", note: "藜同事婚禮" },
  "紅包(藜同學婚禮": { to: "紅包", note: "藜同學婚禮" },
  竹東排骨酥麵: { to: "竹東排骨酥", note: "排骨酥麵" },
  // Reimbursements from 藜 are one payer.
  藜伙食: { to: "藜", note: "伙食費" },
};

const CHAIN = /Costco|全聯|7-11|全家|家樂福|大潤發|美廉社|楓康|Lopia|頂好|裕毛屋|Coupang/;
const TRANSIT = /台鐵|高鐵|客運|捷運|公車|Ubike|YouBike/i;
const VEHICLE = /汽車|機車|加油|中油|燃料|停車|Luxgen|今冠|達盛興|車險/;
const DURABLE = /IKEA|HOLA|Neoflam|oxo|無印|宜得利|Nitori|升降桌|循環扇|床頭櫃|濾水箱|落地窗|巨城|家具|窗簾|地墊|櫃|桌|椅|床|鍋|寢/;

/**
 * Target category for one expense row, from its *original* title and category.
 * Runs before the title merge so the item detail is still available to read.
 * Returns null when the row stays where it is.
 */
function target(cat, title) {
  const t = title ?? "";
  switch (cat) {
    case "traffic": // 車輛 — public transport is discretionary travel
      return TRANSIT.test(t) && !VEHICLE.test(t) ? "travel" : null;
    case "insurance": // 稅務保險 — vehicle costs were never insurance
      return /停車位|汽車保費|國泰汽車保費|國泰保費/.test(t) ? "traffic" : null;
    case "food": // 外食 — grocery chains are 食材採買
      return CHAIN.test(t) ? "fresh" : null;
    case "groceries": // 日用品 — durables are 家居
      return DURABLE.test(t) ? "home" : null;
    case "other":
      if (/[税稅]/.test(t)) return "insurance";
      if (t === "Costco黑鑽卡") return "telecom"; // annual membership: a fixed subscription
      if (/^Costco/.test(t)) return "fresh";
      if (VEHICLE.test(t)) return "traffic";
      return null;
    default:
      return null;
  }
}

/** Reimbursements offset expenses; they are not earnings. */
const REFUND_TITLES = new Set(["藜", "藜伙食"]);

// ---------------------------------------------------------------- read ----

const [catSnap, txSnap, ruleSnap] = await Promise.all([
  led.collection("categories").get(),
  led.collection("transactions").get(),
  led.collection("recurring").get(),
]);
const cats = new Map(catSnap.docs.map((d) => [d.id, d.data()]));
const rules = new Map(ruleSnap.docs.map((d) => [d.id, d.data()]));
const txs = txSnap.docs.filter((d) => (d.data().deletedAt ?? null) === null);
const catName = (id) => (id ? (RENAME[id] ?? cats.get(id)?.name ?? NEW.find((n) => n.id === id)?.name ?? id) : "(未分類)");

log(`${commit ? "COMMIT" : "DRY RUN"} — ledger ${LEDGER}`);
log(`categories ${cats.size} · transactions ${txs.length} active · recurring ${rules.size}`);

const writes = [];
const push = (ref, op, data) => writes.push({ ref, op, data });

// ------------------------------------------------------- 1. categories ----

head("1. 分類：新增 / 更名 / 排序");
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
  if (!cats.has(id)) throw new Error(`要更名的分類不存在: ${id}`);
  log(`  ~ 更名  ${id.padEnd(14)} ${cats.get(id).name} → ${name}`);
  push(led.collection("categories").doc(id), "update", { name });
}
log("\n  排序（依手動記帳頻率；band 僅供對照）:");
for (const [i, id] of ORDER.entries()) {
  const cur = cats.get(id);
  if (!cur && !NEW.some((n) => n.id === id)) throw new Error(`ORDER 含未知分類: ${id}`);
  const from = cur && cur.sortOrder !== i ? `  (was ${cur.sortOrder})` : "";
  if (cur && cur.sortOrder !== i) push(led.collection("categories").doc(id), "update", { sortOrder: i });
  log(`    ${String(i).padStart(2)} ${id.padEnd(14)} ${catName(id).padEnd(6)} [${bandOf(id)}]${from}`);
}

// ------------------------------------------------------------ 2. titles ----

head("2. Title 收斂（title = 商家／收款方，品項移入 note）");
const merged = new Map(); // canonical -> { n, amount, from: Map }
for (const d of txs) {
  const t = d.data();
  const rule = TITLE[t.title];
  if (!rule) continue;
  const data = { title: rule.to, updatedAt: Timestamp.now() };
  // Never clobber a note the owner wrote themselves.
  if (rule.note && !(t.note ?? "").trim()) data.note = rule.note;
  push(d.ref, "update", data);
  if (!merged.has(rule.to)) merged.set(rule.to, { n: 0, amount: 0, from: new Map() });
  const m = merged.get(rule.to);
  m.n++;
  m.amount += t.baseAmount ?? 0;
  m.from.set(t.title, (m.from.get(t.title) ?? 0) + 1);
}
for (const [to, m] of [...merged.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
  const from = [...m.from.entries()].map(([f, n]) => `${f}×${n}`).join(", ");
  log(`  ${to.padEnd(16)} ← ${from}`);
  log(`  ${"".padEnd(16)}   ${m.n} 筆 · ${money(m.amount)}`);
}
log(`\n  合計 ${[...merged.values()].reduce((s, m) => s + m.n, 0)} 筆改 title，${merged.size} 個 canonical title`);

// ------------------------------------------------------ 3. transactions ----

head("3. 交易重新歸類");
const moves = new Map();
let touched = 0;
for (const d of txs) {
  const t = d.data();
  if (t.type !== "expense") continue;
  const to = target(t.categoryId, t.title);
  if (!to || to === t.categoryId) continue;
  const k = `${catName(t.categoryId)} [${bandOf(t.categoryId)}] → ${catName(to)} [${bandOf(to)}]`;
  if (!moves.has(k)) moves.set(k, { n: 0, amount: 0, titles: new Map() });
  const m = moves.get(k);
  m.n++;
  m.amount += t.baseAmount ?? 0;
  const key = (t.title || "(無標題)").slice(0, 16);
  m.titles.set(key, (m.titles.get(key) ?? 0) + 1);
  push(d.ref, "update", { categoryId: to, updatedAt: Timestamp.now() });
  touched++;
}
for (const [k, m] of [...moves.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
  log(`\n  ${k}   ${m.n} 筆 · ${money(m.amount)}`);
  const titles = [...m.titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  log(`    ${titles.map(([t, n]) => `${t}×${n}`).join(", ")}`);
}
log(`\n  合計 ${touched} 筆交易換分類`);

// ----------------------------------------------------------- 4. refunds ----

head("4. 代墊回收改為 refund（抵減支出，不是收入）");
if (!cats.has("refund")) throw new Error("分類 refund 不存在");
let refunds = 0;
let refundAmt = 0;
for (const d of txs) {
  const t = d.data();
  if (t.type !== "income" || !REFUND_TITLES.has(t.title)) continue;
  if (t.categoryId === "refund") continue;
  push(d.ref, "update", { categoryId: "refund", updatedAt: Timestamp.now() });
  refunds++;
  refundAmt += t.baseAmount ?? 0;
}
log(`  交易 ${refunds} 筆 · ${money(refundAmt)}  (${[...REFUND_TITLES].join(", ")})`);
for (const [id, r] of rules) {
  if (r.type !== "income" || !REFUND_TITLES.has(r.title) || r.categoryId === "refund") continue;
  log(`  規則 ${r.title.padEnd(6)} ${money(r.baseAmount).padStart(8)}/月  ${r.categoryId} → refund`);
  push(led.collection("recurring").doc(id), "update", { categoryId: "refund", updatedAt: Timestamp.now() });
}

// ------------------------------------------------------------ 5. checks ----

head("5. 檢核");
// Replay every planned write onto a copy of the rows, then assert.
const after = new Map(txs.map((d) => [d.id, { ...d.data() }]));
for (const w of writes) {
  const row = after.get(w.ref.id);
  if (row) Object.assign(row, w.data);
}
const rows = [...after.values()];
const expBefore = txs.filter((d) => d.data().type === "expense").reduce((s, d) => s + d.data().baseAmount, 0);
const expAfter = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.baseAmount, 0);

const live = new Set([...cats.keys(), ...NEW.map((n) => n.id)]);
const archived = new Set([...cats.entries()].filter(([, c]) => c.archived).map(([id]) => id));
const orphan = rows.filter((r) => r.categoryId && (!live.has(r.categoryId) || archived.has(r.categoryId)));
const stale = rows.filter((r) => TITLE[r.title]);
const unordered = rows.filter((r) => r.type === "expense" && r.categoryId && !ORDER.includes(r.categoryId));

const ok = [
  [`支出總額不變 (${money(expBefore)})`, expBefore === expAfter],
  [`沒有交易指向不存在或已封存的分類`, orphan.length === 0],
  [`沒有殘留的舊 title`, stale.length === 0],
  [`每筆支出都落在 ADR-0008 的三帶內`, unordered.length === 0],
  [`帳戶與金額未被觸碰`, writes.every((w) => !("amount" in w.data || "baseAmount" in w.data || "accountId" in w.data))],
];
for (const [label, pass] of ok) log(`  ${pass ? "✓" : "✗"} ${label}`);
for (const r of orphan.slice(0, 5)) log(`    orphan: ${r.title} → ${r.categoryId}`);
for (const r of stale.slice(0, 5)) log(`    stale title: ${r.title}`);
for (const r of unordered.slice(0, 5)) log(`    未分帶: ${r.title} → ${r.categoryId}`);
if (ok.some(([, p]) => !p)) throw new Error("檢核未通過，未寫入");

// 遷移後的三帶樣貌（近 12 個完整月）
const months = [...new Set(rows.filter((r) => r.type === "expense").map((r) => r.yearMonth))].sort().slice(-13, -1);
const per = new Map();
for (const r of rows) {
  if (r.type !== "expense" || !months.includes(r.yearMonth)) continue;
  per.set(r.categoryId, (per.get(r.categoryId) ?? 0) + r.baseAmount);
}
log(`\n  近 12 個月 (${months[0]}..${months.at(-1)}) 每月平均:`);
const total = [...per.values()].reduce((a, b) => a + b, 0);
for (const [band, ids] of Object.entries(BANDS)) {
  // Round to whole NT dollars: `money` divides by 100, so round the cents away first.
  const perMonth = (cents) => money(Math.round(cents / 1200) * 100);
  const sum = ids.reduce((s, id) => s + (per.get(id) ?? 0), 0);
  log(`    【${band}】${perMonth(sum).padStart(10)}/月   ${((sum / total) * 100).toFixed(1)}%`);
  for (const id of ids.filter((i) => per.get(i)).sort((a, b) => per.get(b) - per.get(a)))
    log(`       ${catName(id).padEnd(12)} ${perMonth(per.get(id)).padStart(9)}/月`);
}

// ------------------------------------------------------------- 6. write ----

head(`6. 寫入 (${writes.length} 筆)`);
if (!commit) {
  log("  DRY RUN — 未寫入任何資料。確認無誤後執行:");
  log("    node scripts/migrate_catalog_2026_08.mjs --commit");
  log(`    node scripts/recompute_rollups.mjs ${LEDGER}`);
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
