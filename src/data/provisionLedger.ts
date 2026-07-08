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
  // A brand-new user can't read their not-yet-created personal ledger under the
  // membership rules, so a read error means "doesn't exist yet" → create it.
  let exists = false;
  try {
    exists = (await getDoc(ledgerRef)).exists();
  } catch {
    exists = false;
  }
  if (!exists) {
    await setDoc(ledgerRef, {
      name: "Personal",
      baseCurrency: "TWD",
      members: { [user.uid]: "owner" },
      memberIds: [user.uid],
      invitedEmails: [],
      memberProfiles: {
        [user.uid]: { name: user.displayName ?? "", email: user.email ?? "" },
      },
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    await seedLedgerCatalog(ledgerId);
  }

  return ledgerId;
}
