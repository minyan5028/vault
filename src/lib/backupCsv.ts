/** Pure backup shape + CSV formatting (no Firebase — so it's unit-testable). */

export type Row = Record<string, unknown>;

export interface Backup {
  version: number;
  exportedAt: string;
  accounts: Row[];
  categories: Row[];
  /** Optional: version-1 files were written before Projects existed. */
  projects?: Row[];
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
  // Project sits beside Category: the two classification axes together, one
  // saying what kind of money it was and the other which episode it belonged
  // to (ADR-0009). An export that could not rebuild the owner's own analysis
  // would not really be an export.
  const projName = new Map((b.projects ?? []).map((p) => [p.id as string, p.name as string]));
  const header = [
    "Date",
    "Type",
    "Title",
    "Category",
    "Project",
    "Account",
    "ToAccount",
    "Amount",
    "Currency",
    "Note",
  ];
  const rows = [...b.transactions]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((t) => [
      String(t.date ?? "").slice(0, 10),
      t.type,
      t.title ?? "",
      catName.get(t.categoryId as string) ?? "",
      projName.get(t.projectId as string) ?? "",
      accName.get(t.accountId as string) ?? "",
      accName.get(t.toAccountId as string) ?? "",
      (Number(t.amount) / 100).toFixed(2),
      t.currency,
      t.note ?? "",
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
