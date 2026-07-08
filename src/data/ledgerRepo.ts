/** Ledgers a user belongs to; creating, sharing (invite/accept), deleting. */
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { seedLedgerCatalog } from "./seedCatalog";
import type { Ledger, MemberProfile } from "../domain/types";

const ledgersCol = () => collection(db, "ledgers");
const ledgerDoc = (id: string) => doc(db, "ledgers", id);
const norm = (email: string) => email.trim().toLowerCase();

function toLedger(s: QueryDocumentSnapshot<DocumentData>): Ledger {
  const d = s.data();
  return {
    id: s.id,
    name: d.name,
    baseCurrency: d.baseCurrency ?? "TWD",
    members: d.members ?? {},
    memberIds: d.memberIds ?? [],
    invitedEmails: d.invitedEmails ?? [],
    memberProfiles: d.memberProfiles ?? {},
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

  /** Live list of ledgers I've been invited to (by email) but not yet joined. */
  subscribeInvites(email: string, cb: (ledgers: Ledger[]) => void): Unsubscribe {
    const q = query(ledgersCol(), where("invitedEmails", "array-contains", norm(email)));
    return onSnapshot(
      q,
      (s) => cb(s.docs.map(toLedger)),
      (e) => console.error("invites", e),
    );
  },

  /** Create a new ledger owned by the user; returns its id. */
  async create(
    uid: string,
    name: string,
    baseCurrency = "TWD",
    profile?: MemberProfile,
  ): Promise<string> {
    const ref = await addDoc(ledgersCol(), {
      name: name.trim() || "Ledger",
      baseCurrency,
      members: { [uid]: "owner" },
      memberIds: [uid],
      invitedEmails: [],
      memberProfiles: profile ? { [uid]: profile } : {},
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    await seedLedgerCatalog(ref.id);
    return ref.id;
  },

  /** Register (or refresh) my own display info on a ledger I'm a member of, so
   *  other members can attribute my entries. Members may update their ledger,
   *  so no security-rules change is needed. */
  setMemberProfile(ledgerId: string, uid: string, profile: MemberProfile) {
    return updateDoc(ledgerDoc(ledgerId), { [`memberProfiles.${uid}`]: profile });
  },

  /** Invite someone by email (adds to the ledger's pending invites). */
  invite(ledgerId: string, email: string) {
    return updateDoc(ledgerDoc(ledgerId), { invitedEmails: arrayUnion(norm(email)) });
  },

  /** Cancel a pending invite. */
  cancelInvite(ledgerId: string, email: string) {
    return updateDoc(ledgerDoc(ledgerId), { invitedEmails: arrayRemove(norm(email)) });
  },

  /** Accept an invite: join as a member and clear your pending email. */
  accept(ledgerId: string, uid: string, email: string) {
    return updateDoc(ledgerDoc(ledgerId), {
      [`members.${uid}`]: "member",
      memberIds: arrayUnion(uid),
      invitedEmails: arrayRemove(norm(email)),
    });
  },

  /** Delete a ledger and all its data (owner only). */
  async remove(ledgerId: string): Promise<void> {
    for (const name of ["accounts", "categories", "transactions", "recurring"]) {
      const snap = await getDocs(collection(db, "ledgers", ledgerId, name));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    }
    await deleteDoc(ledgerDoc(ledgerId));
  },
};
