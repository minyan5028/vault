import { addDays, addMonthsClamped, toDateInputValue } from "../lib/date";
import { recurringRepo } from "./recurringRepo";
import { transactionRepo } from "./transactionRepo";
import type { RecurringRule } from "../domain/types";

function advance(date: Date, rule: RecurringRule): Date {
  if (rule.frequency === "yearly") return addMonthsClamped(date, 12 * rule.interval);
  if (rule.frequency === "monthly") return addMonthsClamped(date, rule.interval);
  return addDays(date, 7 * rule.interval); // weekly
}

/**
 * Generate any due transactions from active recurring rules, up to today, and
 * advance each rule's nextDate. Runs on app open (client-side catch-up — no
 * cloud scheduler needed). Idempotent via nextDate, which we persist.
 */
export async function materializeRecurring(ledgerId: string, uid: string): Promise<void> {
  const rules = await recurringRepo.fetchActive(ledgerId);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  for (const rule of rules) {
    let next = rule.nextDate;
    let generated = 0;
    // Safety cap in case of a bad rule; 400 covers >1yr weekly / 30yr monthly.
    while (next.getTime() <= today.getTime() && generated < 400) {
      // Deterministic id per rule+occurrence → a re-run (partial failure, or a
      // second device) hits addRecurring's existence check and is skipped
      // instead of duplicating the transaction and its rollup effect.
      const id = `${rule.id}_${toDateInputValue(next)}`;
      await transactionRepo.addRecurring(ledgerId, id, {
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        baseAmount: rule.baseAmount,
        baseCurrency: rule.baseCurrency,
        fxRate: rule.fxRate,
        date: next,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        toAccountId: rule.toAccountId,
        title: rule.title,
        note: rule.note,
        createdBy: uid,
      // Never stamped with a Project. Rent, insurance and telecom keep being
      // charged while the owner is away on a trip, and none of it is trip
      // spending (ADR-0009).
      projectId: null,
      });
      next = advance(next, rule);
      generated += 1;
    }
    if (generated > 0) {
      await recurringRepo.update(ledgerId, rule.id, { nextDate: next });
    }
  }
}
