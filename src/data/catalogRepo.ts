/**
 * Accounts and categories ("the catalog") for a ledger, from Firestore.
 * Replaces the hardcoded fixtures so the app is fully data-driven and the
 * catalog is user-manageable.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Account, Category } from "../domain/types";

const accountsCol = (l: string) => collection(db, "ledgers", l, "accounts");
const categoriesCol = (l: string) => collection(db, "ledgers", l, "categories");
const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

function toAccount(s: QueryDocumentSnapshot<DocumentData>): Account {
  const d = s.data();
  return {
    id: s.id,
    name: d.name,
    type: d.type ?? "other",
    currency: d.currency ?? "TWD",
    openingBalance: d.openingBalance ?? 0,
    archived: !!d.archived,
    sortOrder: d.sortOrder ?? 0,
  };
}

function toCategory(s: QueryDocumentSnapshot<DocumentData>): Category {
  const d = s.data();
  return {
    id: s.id,
    name: d.name,
    type: d.type ?? "expense",
    icon: d.icon ?? null,
    parentId: d.parentId ?? null,
    archived: !!d.archived,
    sortOrder: d.sortOrder ?? 0,
  };
}

export const accountRepo = {
  async fetch(ledgerId: string): Promise<Account[]> {
    return (await getDocs(accountsCol(ledgerId))).docs.map(toAccount).sort(bySort);
  },
  subscribe(ledgerId: string, cb: (a: Account[]) => void): Unsubscribe {
    return onSnapshot(
      accountsCol(ledgerId),
      (s) => cb(s.docs.map(toAccount).sort(bySort)),
      (e) => console.error("accounts", e),
    );
  },
  add(ledgerId: string, input: { name: string; type?: string; currency?: string; sortOrder?: number }) {
    return addDoc(accountsCol(ledgerId), {
      name: input.name.trim(),
      type: input.type ?? "other",
      currency: input.currency ?? "TWD",
      archived: false,
      sortOrder: input.sortOrder ?? 999,
      createdAt: serverTimestamp(),
    });
  },
  update(ledgerId: string, id: string, patch: Partial<Account>) {
    return updateDoc(doc(accountsCol(ledgerId), id), { ...patch });
  },
};

export const categoryRepo = {
  async fetch(ledgerId: string): Promise<Category[]> {
    return (await getDocs(categoriesCol(ledgerId))).docs.map(toCategory).sort(bySort);
  },
  subscribe(ledgerId: string, cb: (c: Category[]) => void): Unsubscribe {
    return onSnapshot(
      categoriesCol(ledgerId),
      (s) => cb(s.docs.map(toCategory).sort(bySort)),
      (e) => console.error("categories", e),
    );
  },
  add(
    ledgerId: string,
    input: { name: string; icon?: string | null; type?: "expense" | "income"; sortOrder?: number },
  ) {
    return addDoc(categoriesCol(ledgerId), {
      name: input.name.trim(),
      icon: input.icon ?? null,
      type: input.type ?? "expense",
      parentId: null,
      archived: false,
      sortOrder: input.sortOrder ?? 999,
      createdAt: serverTimestamp(),
    });
  },
  update(ledgerId: string, id: string, patch: Partial<Category>) {
    return updateDoc(doc(categoriesCol(ledgerId), id), { ...patch });
  },
};
