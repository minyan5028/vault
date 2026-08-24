import type { Account, Category, Project } from "../domain/types";
import { accountRepo, categoryRepo } from "./catalogRepo";
import { projectRepo } from "./projectRepo";
import { useLiveQuery } from "./useLiveQuery";

const NO_ACCOUNTS: Account[] = [];
const NO_CATEGORIES: Category[] = [];
const NO_PROJECTS: Project[] = [];

/**
 * Live accounts + categories + projects for a ledger.
 *
 * Subscription only, no one-shot fetch: the subscription's first delivery is
 * served from the persistent local cache, so returning to a ledger you looked
 * at moments ago paints without a round trip, while a `getDocs` would go to the
 * server every time. Going through `useLiveQuery` is also what blanks the
 * catalog the instant the ledger changes — otherwise the previous ledger's
 * accounts stay on screen next to the new ledger's balances.
 */
export function useLedgerData(ledgerId: string): {
  accounts: Account[];
  categories: Category[];
  projects: Project[];
} {
  const accounts = useLiveQuery(ledgerId, NO_ACCOUNTS, (emit) =>
    accountRepo.subscribe(ledgerId, emit),
  );
  const categories = useLiveQuery(ledgerId, NO_CATEGORIES, (emit) =>
    categoryRepo.subscribe(ledgerId, emit),
  );
  const projects = useLiveQuery(ledgerId, NO_PROJECTS, (emit) =>
    projectRepo.subscribe(ledgerId, emit),
  );
  return { accounts, categories, projects };
}
