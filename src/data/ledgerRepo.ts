/** Ledgers a user belongs to, and creating new ones (personal or shared). */
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { seedLedgerCatalog } from "./seedCatalog";
import type { Ledger } from "../domain/types";

const ledgersCol = () => collection(db, "ledgers");

function toLedger(s: QueryDocumentSnapshot<DocumentData>): Ledger {
  const d = s.data();
  return {
    id: s.id,
    name: d.name,
    baseCurrency: d.baseCurrency ?? "TWD",
    members: d.members ?? {},
    memberIds: d.memberIds ?? [],
    invitedEmails: d.invitedEmails ?? [],
    createdBy: d.createdBy,
    createdAt: d.createdAt?.toDate?.() ?? new Date(),
  };
}

export const ledgerRepo = {
  /** Live list of ledgers the user is a member of. */
  subscribeMine(uid: string, cb: (ledgers: Ledger[]) => void): Unsubscribe {
    const q = query(ledgersCol(), where("memberIds", "array-contains", uid));
    return onSnapshot(
      q,
      (s) => cb(s.docs.map(toLedger).sort((a, b) => a.name.localeCompare(b.name))),
      (e) => console.error("ledgers", e),
    );
  },

  /** Create a new ledger owned by the user; returns its id. */
  async create(uid: string, name: string, baseCurrency = "TWD"): Promise<string> {
    const ref = await addDoc(ledgersCol(), {
      name: name.trim() || "Ledger",
      baseCurrency,
      members: { [uid]: "owner" },
      memberIds: [uid],
      invitedEmails: [],
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    await seedLedgerCatalog(ref.id);
    return ref.id;
  },
};
