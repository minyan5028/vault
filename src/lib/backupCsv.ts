/** Pure backup shape + CSV formatting (no Firebase — so it's unit-testable). */

export type Row = Record<string, unknown>;

export interface Backup {
  version: number;
  exportedAt: string;
  accounts: Row[];
  categories: Row[];
  transactions: Row[];
  recurring: Row[];
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Human-readable transactions CSV (amounts in major units, names resolved). */
export function backupToCsv(b: Backup): string {
  const catName = new Map(b.categories.map((c) => [c.id as string, c.name as string]));
  const accName = new Map(b.accounts.map((a) => [a.id as string, a.name as string]));
  const header = ["Date", "Type", "Title", "Category", "Account", "ToAccount", "Amount", "Currency", "Note"];
  const rows = [...b.transactions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((t) => [
      String(t.date ?? "").slice(0, 10),
      t.type,
      t.title ?? "",
      catName.get(t.categoryId as string) ?? "",
      accName.get(t.accountId as string) ?? "",
      accName.get(t.toAccountId as string) ?? "",
      (Number(t.amount) / 100).toFixed(2),
      t.currency,
      t.note ?? "",
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
