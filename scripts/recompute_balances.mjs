import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const fmt = (n) => "NT$" + (n / 100).toLocaleString("en-US");

async function recompute(ledgerId) {
  const snap = await db.collection("ledgers").doc(ledgerId).collection("transactions").get();
  const netFlow = {};
  const add = (a, v) => {
    if (a) netFlow[a] = (netFlow[a] || 0) + v;
  };
  let active = 0;
  snap.forEach((d) => {
    const t = d.data();
    if ((t.deletedAt ?? null) !== null) return;
    active++;
    if (t.type === "income") add(t.accountId, t.baseAmount);
    else if (t.type === "expense") add(t.accountId, -t.baseAmount);
    else if (t.type === "transfer") {
      add(t.accountId, -t.baseAmount);
      add(t.toAccountId, t.baseAmount);
    }
  });
  await db.collection("ledgers").doc(ledgerId).collection("meta").doc("balances").set({ netFlow });
  console.log(ledgerId, "reads=" + snap.size, "active=" + active);
  for (const [a, v] of Object.entries(netFlow).sort((x, y) => y[1] - x[1]))
    console.log("   " + a.padEnd(22) + fmt(v));
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
