import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./defaults";

/**
 * Ensure the signed-in user has a `users/{uid}` doc and a personal Ledger.
 * The personal ledger id is the uid (one per user); shared ledgers get their
 * own ids later. Returns the personal ledger id. Safe to call on every sign-in.
 */
export async function provisionPersonalLedger(user: User): Promise<string> {
  const ledgerId = user.uid;

  await setDoc(
    doc(db, "users", user.uid),
    {
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      defaultLedger: ledgerId,
    },
    { merge: true },
  );

  const ledgerRef = doc(db, "ledgers", ledgerId);
  const snap = await getDoc(ledgerRef);
  if (!snap.exists()) {
    await setDoc(ledgerRef, {
      name: "Personal",
      baseCurrency: "TWD",
      members: { [user.uid]: "owner" },
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    // Seed a starter catalog so a fresh ledger is usable immediately.
    const batch = writeBatch(db);
    DEFAULT_ACCOUNTS.forEach((a, i) =>
      batch.set(doc(db, "ledgers", ledgerId, "accounts", a.id), {
        name: a.name,
        type: "other",
        currency: "TWD",
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
    await batch.commit();
  }

  return ledgerId;
}
