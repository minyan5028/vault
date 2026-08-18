import { describe, it, expect } from "vitest";
import { backupToCsv, type Backup } from "./backupCsv";

const backup: Backup = {
  version: 1,
  exportedAt: "",
  accounts: [
    { id: "gen", name: "General" },
    { id: "sav", name: "Savings" },
  ],
  categories: [{ id: "food", name: "Food" }],
  projects: [{ id: "tokyo", name: "東京" }],
  transactions: [
    {
      date: "2026-07-03T00:00:00Z",
      type: "expense",
      title: "大戶屋",
      categoryId: "food",
      projectId: "tokyo",
      accountId: "gen",
      toAccountId: null,
      amount: 14990,
      currency: "TWD",
      note: null,
    },
    {
      date: "2026-07-01T00:00:00Z",
      type: "transfer",
      title: "約會基金",
      categoryId: null,
      projectId: null,
      accountId: "gen",
      toAccountId: "sav",
      amount: 200000,
      currency: "TWD",
      note: "a,b",
    },
  ],
  recurring: [],
};

describe("backupToCsv", () => {
  const lines = backupToCsv(backup).split("\n");

  it("has the header row", () => {
    expect(lines[0]).toBe(
      "Date,Type,Title,Category,Project,Account,ToAccount,Amount,Currency,Note",
    );
  });

  it("resolves names, divides the amount by 100, newest first", () => {
    expect(lines[1]).toBe("2026-07-03,expense,大戶屋,Food,東京,General,,149.90,TWD,");
  });

  it("resolves both transfer accounts and quotes a value containing a comma", () => {
    expect(lines[2]).toBe('2026-07-01,transfer,約會基金,,,General,Savings,2000.00,TWD,"a,b"');
  });

  it("exports a backup written before Projects existed", () => {
    // A version-1 file has no `projects` key at all; the column is simply blank
    // rather than the export failing.
    const legacy = { ...backup, projects: undefined };
    const rows = backupToCsv(legacy).split("\n");
    expect(rows[0]).toContain(",Project,");
    expect(rows[1]).toBe("2026-07-03,expense,大戶屋,Food,,General,,149.90,TWD,");
  });
});
