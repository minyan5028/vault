import { useEffect, useState } from "react";
import type { Account, Category, Project } from "../domain/types";
import { accountRepo, categoryRepo } from "./catalogRepo";
import { projectRepo } from "./projectRepo";

/** Live accounts + categories + projects for a ledger (one-shot fetch, then
 *  subscribed). */
export function useLedgerData(ledgerId: string): {
  accounts: Account[];
  categories: Category[];
  projects: Project[];
} {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!ledgerId) return;
    let cancelled = false;
    const setA = (a: Account[]) => !cancelled && setAccounts(a);
    const setC = (c: Category[]) => !cancelled && setCategories(c);
    const setP = (p: Project[]) => !cancelled && setProjects(p);

    accountRepo.fetch(ledgerId).then(setA).catch(console.error);
    categoryRepo.fetch(ledgerId).then(setC).catch(console.error);
    projectRepo.fetch(ledgerId).then(setP).catch(console.error);
    const unsubA = accountRepo.subscribe(ledgerId, setA);
    const unsubC = categoryRepo.subscribe(ledgerId, setC);
    const unsubP = projectRepo.subscribe(ledgerId, setP);

    return () => {
      cancelled = true;
      unsubA();
      unsubC();
      unsubP();
    };
  }, [ledgerId]);

  return { accounts, categories, projects };
}
