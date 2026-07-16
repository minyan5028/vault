import { doc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./defaults";

/** Seed a new ledger with a default set of accounts and categories. */
export async function seedLedgerCatalog(ledgerId: string): Promise<void> {
  const batch = writeBatch(db);
  DEFAULT_ACCOUNTS.forEach((a, i) =>
    batch.set(doc(db, "ledgers", ledgerId, "accounts", a.id), {
      name: a.name,
      type: "other",
      currency: "TWD",
      openingBalance: 0,
      archived: false,
      sortOrder: i,
    }),
  );
  DEFAULT_CATEGORIES.forEach((c, i) =>
    batch.set(doc(db, "ledgers", ledgerId, "categories", c.id), {
      name: c.name,
      icon: c.icon,
      type: "expense",
      parentId: null,
      archived: false,
      sortOrder: i,
    }),
  );
  DEFAULT_INCOME_CATEGORIES.forEach((c, i) =>
    batch.set(doc(db, "ledgers", ledgerId, "categories", c.id), {
      name: c.name,
      icon: c.icon,
      type: "income",
      parentId: null,
      archived: false,
      sortOrder: i,
    }),
  );
  // Empty balance rollup, maintained incrementally by transactionRepo. Merge so
  // that if this ever runs against an existing ledger by mistake, it can't wipe
  // an established netFlow (merging {} leaves existing keys intact).
  batch.set(doc(db, "ledgers", ledgerId, "meta", "balances"), { netFlow: {} }, { merge: true });
  await batch.commit();
}
