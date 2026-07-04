import { useEffect, useState } from "react";
import type { Account, Category } from "../domain/types";
import { accountRepo, categoryRepo } from "./catalogRepo";

/** Live accounts + categories for a ledger (one-shot fetch, then subscribed). */
export function useLedgerData(ledgerId: string): { accounts: Account[]; categories: Category[] } {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!ledgerId) return;
    let cancelled = false;
    const setA = (a: Account[]) => !cancelled && setAccounts(a);
    const setC = (c: Category[]) => !cancelled && setCategories(c);

    accountRepo.fetch(ledgerId).then(setA).catch(console.error);
    categoryRepo.fetch(ledgerId).then(setC).catch(console.error);
    const unsubA = accountRepo.subscribe(ledgerId, setA);
    const unsubC = categoryRepo.subscribe(ledgerId, setC);

    return () => {
      cancelled = true;
      unsubA();
      unsubC();
    };
  }, [ledgerId]);

  return { accounts, categories };
}
