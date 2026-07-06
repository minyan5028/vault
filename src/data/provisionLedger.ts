import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { seedLedgerCatalog } from "./seedCatalog";

/**
 * Ensure the signed-in user has a `users/{uid}` doc and a personal Ledger.
 * The personal ledger id is the uid (one per user); shared ledgers get their
 * own ids. Returns the personal ledger id. Safe to call on every sign-in.
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
      memberIds: [user.uid],
      invitedEmails: [],
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    await seedLedgerCatalog(ledgerId);
  }

  return ledgerId;
}
