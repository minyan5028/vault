// Rebuild per-month rollups (ledgers/{id}/rollups/{yearMonth}) from scratch.
// Doubles as a repair tool: clears existing rollup docs, then writes fresh
// absolute totals so any drift from the maintained increments is corrected.
// Usage: node scripts/recompute_rollups.mjs <ledgerId> [<ledgerId> ...]
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const fmt = (n) => "NT$" + (n / 100).toLocaleString("en-US");
const UNCATEGORIZED = "uncategorized";

async function recompute(ledgerId) {
  const ledger = db.collection("ledgers").doc(ledgerId);
  const snap = await ledger.collection("transactions").get();

  const months = new Map(); // yearMonth -> { income, expense, expenseByCategory, incomeByCategory }
  const bump = (ym) => {
    if (!months.has(ym))
      months.set(ym, { income: 0, expense: 0, expenseByCategory: {}, incomeByCategory: {} });
    return months.get(ym);
  };
  let active = 0;
  snap.forEach((d) => {
    const t = d.data();
    if ((t.deletedAt ?? null) !== null) return;
    if (t.type === "transfer") return; // not income/expense
    active++;
    const m = bump(t.yearMonth);
    const cat = t.categoryId ?? UNCATEGORIZED;
    if (t.type === "income") {
      m.income += t.baseAmount;
      m.incomeByCategory[cat] = (m.incomeByCategory[cat] || 0) + t.baseAmount;
    } else if (t.type === "expense") {
      m.expense += t.baseAmount;
      m.expenseByCategory[cat] = (m.expenseByCategory[cat] || 0) + t.baseAmount;
    }
  });

  // Clear stale rollup docs, then write the freshly computed set.
  const existing = await ledger.collection("rollups").get();
  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops) await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  for (const d of existing.docs) {
    batch.delete(d.ref);
    if (++ops >= 400) await flush();
  }
  const now = new Date();
  for (const [yearMonth, m] of months) {
    batch.set(ledger.collection("rollups").doc(yearMonth), { yearMonth, ...m, updatedAt: now });
    if (++ops >= 400) await flush();
  }
  await flush();

  console.log(ledgerId, "reads=" + snap.size, "active=" + active, "months=" + months.size);
  const totalExpense = [...months.values()].reduce((s, m) => s + m.expense, 0);
  const totalIncome = [...months.values()].reduce((s, m) => s + m.income, 0);
  console.log("   income " + fmt(totalIncome) + "  expense " + fmt(totalExpense));
}

const [, , ...ledgers] = process.argv;
for (const l of ledgers) {
  try {
    await recompute(l);
  } catch (e) {
    console.log(l, "FAILED code=" + (e.code || e.message));
  }
}
process.exit(0);
