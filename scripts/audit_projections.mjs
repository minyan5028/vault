/**
 * Audit a ledger's projections against its Financial Events. READ-ONLY.
 *
 * Transactions are the source of truth (ADR-0005); `meta/balances.netFlow` and
 * `rollups/{yearMonth}` are derived caches maintained by atomic increments on
 * every write. A missed or double-counted increment shows up as drift between
 * the two, and nothing in the app would tell you — the numbers just quietly
 * stop matching.
 *
 * This re-derives both projections from the transactions and diffs them against
 * what is stored. It deliberately re-implements the rules rather than importing
 * src/lib: an oracle that shares code with the thing it checks can't catch a
 * bug in the shared part. Keep it in sync with docs/DATA_MODEL.md by hand.
 *
 * Usage:
 *   node scripts/audit_projections.mjs                 # every visible ledger
 *   node scripts/audit_projections.mjs <ledgerId> ...  # specific ledgers
 *
 * Exits 1 if any drift is found, so it can gate a deploy.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();

const UNCATEGORIZED = "uncategorized";
const money = (minor) => (minor / 100).toFixed(2);
const yearMonthOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Re-derive both projections from a ledger's active transactions. */
function derive(txDocs) {
  const netFlow = {};
  const months = new Map();
  const move = (endpoint, v) => {
    if (endpoint) netFlow[endpoint] = (netFlow[endpoint] ?? 0) + v;
  };
  const month = (ym) => {
    if (!months.has(ym)) {
      // Must carry every dimension in BREAKDOWNS (src/domain/types.ts); a
      // missing one would silently audit as "matches".
      months.set(ym, {
        income: 0,
        expense: 0,
        expenseByCategory: {},
        incomeByCategory: {},
        expenseByProject: {},
        incomeByProject: {},
      });
    }
    return months.get(ym);
  };

  let active = 0;
  for (const doc of txDocs) {
    const t = doc.data();
    if ((t.deletedAt ?? null) !== null) continue;
    active++;

    // Balances: each endpoint moves in its own currency. The source moves by
    // `amount`, a transfer's destination by `toAmount`.
    const toAmount = t.toAmount ?? t.amount;
    if (t.type === "income") move(t.accountId, t.amount);
    else if (t.type === "expense") move(t.accountId, -t.amount);
    else if (t.type === "transfer") {
      move(t.accountId, -t.amount);
      move(t.toAccountId, toAmount);
    }

    // Month rollups: base-currency (TWD) figures; transfers contribute nothing.
    if (t.type === "transfer") continue;
    const ym = t.yearMonth ?? yearMonthOf(t.date.toDate());
    const m = month(ym);
    const cat = t.categoryId ?? UNCATEGORIZED;
    const proj = t.projectId ?? null; // sparse: no key for everyday spending
    if (t.type === "income") {
      m.income += t.baseAmount;
      m.incomeByCategory[cat] = (m.incomeByCategory[cat] ?? 0) + t.baseAmount;
      if (proj) m.incomeByProject[proj] = (m.incomeByProject[proj] ?? 0) + t.baseAmount;
    } else {
      m.expense += t.baseAmount;
      m.expenseByCategory[cat] = (m.expenseByCategory[cat] ?? 0) + t.baseAmount;
      if (proj) m.expenseByProject[proj] = (m.expenseByProject[proj] ?? 0) + t.baseAmount;
    }
  }
  return { netFlow, months, active };
}

/** Compare two {key: minor} maps, ignoring keys that are zero on both sides. */
function diffMaps(expected, actual) {
  const drift = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const e = expected[key] ?? 0;
    const a = actual[key] ?? 0;
    if (e !== a) drift.push({ key, expected: e, actual: a, delta: a - e });
  }
  return drift;
}

async function audit(ledgerId) {
  const ledger = db.collection("ledgers").doc(ledgerId);
  const [txs, balancesDoc, rollupDocs, accountDocs, holdingDocs] = await Promise.all([
    ledger.collection("transactions").get(),
    ledger.collection("meta").doc("balances").get(),
    ledger.collection("rollups").get(),
    ledger.collection("accounts").get(),
    ledger.collection("holdings").get(),
  ]);

  const { netFlow, months, active } = derive(txs.docs);
  const storedNetFlow = balancesDoc.data()?.netFlow ?? {};

  // Endpoint names, so drift is reported against something recognisable.
  const names = new Map();
  for (const d of accountDocs.docs) names.set(d.id, `${d.data().name} (account)`);
  for (const d of holdingDocs.docs) names.set(d.id, `${d.data().ticker} (holding)`);
  const label = (id) => names.get(id) ?? `${id} (ORPHAN — matches no account or holding)`;

  console.log(`\n── ${ledgerId}`);
  console.log(`   ${txs.size} transactions (${active} active) · ${rollupDocs.size} month rollups`);

  let problems = 0;

  const balanceDrift = diffMaps(netFlow, storedNetFlow);
  if (balanceDrift.length === 0) {
    console.log("   ✓ balances match the transactions");
  } else {
    problems += balanceDrift.length;
    console.log(`   ✗ balance drift on ${balanceDrift.length} endpoint(s):`);
    for (const d of balanceDrift) {
      console.log(
        `       ${label(d.key)}\n` +
          `         derived ${money(d.expected).padStart(14)}` +
          `   stored ${money(d.actual).padStart(14)}` +
          `   off by ${money(d.delta)}`,
      );
    }
  }

  // Month rollups: totals and per-category maps, in both directions.
  const stored = new Map(rollupDocs.docs.map((d) => [d.id, d.data()]));
  const monthKeys = [...new Set([...months.keys(), ...stored.keys()])].sort();
  const monthProblems = [];
  for (const ym of monthKeys) {
    const want = months.get(ym) ?? {
      income: 0,
      expense: 0,
      expenseByCategory: {},
      incomeByCategory: {},
      expenseByProject: {},
      incomeByProject: {},
    };
    const got = stored.get(ym) ?? {};
    const issues = [];
    if ((got.income ?? 0) !== want.income) {
      issues.push(`income derived ${money(want.income)} vs stored ${money(got.income ?? 0)}`);
    }
    if ((got.expense ?? 0) !== want.expense) {
      issues.push(`expense derived ${money(want.expense)} vs stored ${money(got.expense ?? 0)}`);
    }
    for (const [field, wantMap] of [
      ["expenseByCategory", want.expenseByCategory],
      ["incomeByCategory", want.incomeByCategory],
      ["expenseByProject", want.expenseByProject],
      ["incomeByProject", want.incomeByProject],
    ]) {
      for (const d of diffMaps(wantMap, got[field] ?? {})) {
        issues.push(`${field}.${d.key} derived ${money(d.expected)} vs stored ${money(d.actual)}`);
      }
    }
    if (issues.length) monthProblems.push({ ym, issues });
  }

  if (monthProblems.length === 0) {
    console.log("   ✓ month rollups match the transactions");
  } else {
    problems += monthProblems.length;
    console.log(`   ✗ rollup drift in ${monthProblems.length} month(s):`);
    for (const { ym, issues } of monthProblems) {
      console.log(`       ${ym}`);
      for (const i of issues) console.log(`         ${i}`);
    }
  }

  const orphans = Object.keys(storedNetFlow).filter(
    (id) => storedNetFlow[id] !== 0 && !names.has(id),
  );
  if (orphans.length) {
    console.log(
      `   ! ${orphans.length} endpoint(s) carry a non-zero balance but match no\n` +
        `     account or holding — a deleted holding whose legs were not reversed:`,
    );
    for (const id of orphans) console.log(`       ${id}  ${money(storedNetFlow[id])}`);
  }

  return problems;
}

const args = process.argv.slice(2);
const ledgerIds = args.length
  ? args
  : (await db.collection("ledgers").get()).docs.map((d) => d.id);

if (ledgerIds.length === 0) {
  console.log("No ledgers found.");
  process.exit(0);
}

console.log(`Auditing ${ledgerIds.length} ledger(s) — read-only, nothing is written.`);
let total = 0;
for (const id of ledgerIds) {
  try {
    total += await audit(id);
  } catch (e) {
    total++;
    console.log(`\n── ${id}\n   FAILED: ${e.code ?? e.message}`);
  }
}

console.log(
  total === 0
    ? "\n✓ All projections agree with the transactions.\n"
    : `\n✗ ${total} problem(s). Repair with scripts/recompute_balances.mjs and\n` +
        `  scripts/recompute_rollups.mjs, then re-run this audit.\n`,
);
process.exit(total === 0 ? 0 : 1);
