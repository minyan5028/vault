/**
 * The Firestore adapter for a WritePlan — the "how to write" half of the seam.
 *
 * Everything it does is mechanical: resolve a path to a DocumentReference and
 * translate the plan's symbolic sentinels into Firestore's own. All decisions
 * about *what* to write live in `writes.ts`, which is why this file has no
 * branching on the domain and needs no tests of its own.
 */
import {
  Timestamp,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { isSentinel, type DocPath, type PlanData, type PlanValue, type WritePlan } from "./writePlan";

/** The write surface shared by a WriteBatch and a Transaction. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData, options?: { merge: true }): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
  delete(ref: DocumentReference): unknown;
}

/** The document at a plan path — also the bridge the read side uses, so
 *  queries and writes name documents the same way. */
export function docRef(path: DocPath): DocumentReference {
  const [first, ...rest] = path;
  return doc(db, first, ...rest);
}

/** The collection at a plan path. */
export function collectionRef(path: DocPath): CollectionReference {
  const [first, ...rest] = path;
  return collection(db, first, ...rest);
}

/** A fresh document id in the collection at `path`. Ids are allocated by the
 *  repo and passed into the planners, so a plan is fully determined by its
 *  inputs and can be asserted in a test. */
export function newDocId(path: DocPath): string {
  return doc(collectionRef(path)).id;
}


/** Translate a plan value into what the Firestore SDK expects. */
function toFirestore(value: PlanValue): unknown {
  if (isSentinel(value)) {
    switch (value.$) {
      case "serverTime":
        return serverTimestamp();
      case "increment":
        return increment(value.by);
      case "time":
        return Timestamp.fromMillis(value.ms);
    }
  }
  if (Array.isArray(value)) return value.map(toFirestore);
  if (typeof value === "object" && value !== null) return toFirestoreData(value as PlanData);
  return value;
}

function toFirestoreData(data: PlanData): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) out[key] = toFirestore(value);
  return out;
}

/** Stage a plan's operations onto an existing batch or transaction. */
export function stagePlan(writer: Writer, plan: WritePlan): void {
  for (const op of plan.ops) {
    const ref = docRef(op.path);
    if (op.kind === "set") {
      if (op.merge) writer.set(ref, toFirestoreData(op.data), { merge: true });
      else writer.set(ref, toFirestoreData(op.data));
    } else if (op.kind === "update") {
      writer.update(ref, toFirestoreData(op.data));
    } else {
      writer.delete(ref);
    }
  }
}

/** Commit a plan as one atomic batch. A plan with no operations commits
 *  nothing — an effect that moves nothing is a legitimate outcome. */
export async function commitPlan(plan: WritePlan): Promise<void> {
  if (plan.ops.length === 0) return;
  const batch = writeBatch(db);
  stagePlan(batch as unknown as Writer, plan);
  await batch.commit();
}

/**
 * Run a read-then-write inside a Firestore transaction: `decide` sees the
 * transaction (to read documents) and returns the plan to commit, so the read
 * and the write it justifies are atomic. Used wherever a write depends on the
 * stored document — an edit, a delete, the recurring existence check.
 */
export function commitPlanned<T>(
  decide: (tx: Transaction) => Promise<{ plan: WritePlan; result: T }>,
): Promise<T> {
  return runTransaction(db, async (tx) => {
    const { plan, result } = await decide(tx);
    stagePlan(tx as unknown as Writer, plan);
    return result;
  });
}
