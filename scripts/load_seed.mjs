/**
 * Load the migrated Notion seed into Firestore under a user's personal ledger.
 *
 * Uses the Firebase Admin SDK (bypasses security rules), so it needs a service
 * account key. Writes accounts, categories and transactions under
 * ledgers/{uid}, remapping the seed's placeholder "owner" createdBy to the real
 * uid and converting ISO date strings to Firestore Timestamps.
 *
 * Usage:
 *   node scripts/load_seed.mjs <your-uid> [serviceAccountKey.json] [seed.json]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const [, , uid, keyPath = "serviceAccountKey.json", seedPath = "data/migrated/vault-seed.json"] =
  process.argv;

if (!uid) {
  console.error("Usage: node scripts/load_seed.mjs <your-uid> [serviceAccountKey.json] [seed.json]");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const ledgerRef = db.collection("ledgers").doc(uid);

const tsOrNull = (iso) => (iso ? Timestamp.fromDate(new Date(iso)) : null);

async function loadSmall(coll, items) {
  const batch = db.batch();
  for (const { id, ...data } of items) {
    batch.set(ledgerRef.collection(coll).doc(id), data, { merge: true });
  }
  await batch.commit();
  console.log(`  ${coll}: ${items.length}`);
}

async function loadTransactions(txns) {
  let done = 0;
  for (let i = 0; i < txns.length; i += 450) {
    const chunk = txns.slice(i, i + 450);
    const batch = db.batch();
    for (const { id, ...rest } of chunk) {
      batch.set(ledgerRef.collection("transactions").doc(id), {
        ...rest,
        createdBy: uid, // remap placeholder -> real uid
        date: tsOrNull(rest.date),
        createdAt: tsOrNull(rest.createdAt),
        updatedAt: tsOrNull(rest.updatedAt),
        deletedAt: tsOrNull(rest.deletedAt),
      });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  transactions: ${done}/${txns.length}`);
  }
}

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
console.log(`Loading seed into ledgers/${uid} ...`);
await loadSmall("accounts", seed.accounts);
await loadSmall("categories", seed.categories);
await loadTransactions(seed.transactions);
console.log("Done.");
process.exit(0);
