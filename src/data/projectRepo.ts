/**
 * Projects for a Ledger — bounded, non-daily episodes of spending (ADR-0009).
 *
 * Ordinary create/rename/delete are single-document writes and go straight to
 * the SDK, the way the catalog does. Auto-assignment is the exception: it spans
 * documents (turning one Project on must turn another off) so it goes through
 * a WritePlan, which is where that invariant is decided and tested.
 */
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { projectState } from "../lib/project";
import { commitPlan } from "./firestoreExec";
import { planSetAutoAssign } from "./writes";
import type { Project } from "../domain/types";

const col = (ledgerId: string) => collection(db, "ledgers", ledgerId, "projects");

/** What the form provides; the repo adds `autoAssign`, `deletedAt`, timestamps. */
export interface ProjectInput {
  name: string;
  startDate: Date;
  endDate: Date;
}

function toProject(s: QueryDocumentSnapshot<DocumentData>): Project {
  const d = s.data();
  return {
    id: s.id,
    name: d.name,
    startDate: (d.startDate as Timestamp).toDate(),
    endDate: (d.endDate as Timestamp).toDate(),
    autoAssign: !!d.autoAssign,
    deletedAt: d.deletedAt ? (d.deletedAt as Timestamp).toDate() : null,
  };
}

/** Most recent episode first — the one being reviewed is nearly always the
 *  latest. Deleted Projects are filtered in memory: the collection holds a
 *  handful of documents, so a query would cost an index for nothing. */
function live(docs: QueryDocumentSnapshot<DocumentData>[]): Project[] {
  return docs
    .map(toProject)
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}

export const projectRepo = {
  subscribe(ledgerId: string, cb: (projects: Project[]) => void): Unsubscribe {
    return onSnapshot(
      col(ledgerId),
      (s) => cb(live(s.docs)),
      (e) => console.error("projects", e),
    );
  },

  add(ledgerId: string, input: ProjectInput) {
    return addDoc(col(ledgerId), {
      name: input.name.trim(),
      startDate: Timestamp.fromDate(input.startDate),
      endDate: Timestamp.fromDate(input.endDate),
      autoAssign: false,
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  update(ledgerId: string, id: string, patch: Partial<ProjectInput>) {
    const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.startDate) data.startDate = Timestamp.fromDate(patch.startDate);
    if (patch.endDate) {
      data.endDate = Timestamp.fromDate(patch.endDate);
      // Closing a Project by moving its end date into the past also stops it
      // auto-assigning. Without this the flag has no way out: the form hides
      // the toggle once a Project has ended, so a Project that was stamping
      // when it closed would keep the flag set forever. The authoritative
      // guarantee is still the derived one — an ended Project stamps nothing
      // whatever the flag says — this only keeps the stored value honest.
      // `startDate` only has to be before the end for the "ended" test; the
      // caller's own start date is passed when it is being changed too.
      const startDate = patch.startDate ?? patch.endDate;
      if (projectState({ startDate, endDate: patch.endDate }, new Date()) === "ended") {
        data.autoAssign = false;
      }
    }
    return updateDoc(doc(col(ledgerId), id), data);
  },

  /** Soft delete (ADR-0004). Financial Events keep pointing at it. */
  remove(ledgerId: string, id: string) {
    return updateDoc(doc(col(ledgerId), id), {
      deletedAt: serverTimestamp(),
      autoAssign: false,
      updatedAt: serverTimestamp(),
    });
  },

  /** At most one Project auto-assigns per Ledger — see `planSetAutoAssign`. */
  setAutoAssign(ledgerId: string, projects: readonly Project[], id: string, on: boolean) {
    return commitPlan(planSetAutoAssign(ledgerId, projects, id, on));
  },
};
