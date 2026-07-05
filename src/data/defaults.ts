/**
 * Default accounts and categories seeded into a *brand-new* ledger on first
 * sign-in (see provisionLedger). Existing ledgers keep their own data. These
 * are also the icon source used to patch categories imported without icons.
 */

export interface DefaultAccount {
  id: string;
  name: string;
}

export interface DefaultCategory {
  id: string;
  name: string;
  icon: string;
}

export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  { id: "cash", name: "Cash" },
  { id: "bank", name: "Bank" },
];

// A small generic starter set of income categories.
export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { id: "salary", name: "Salary", icon: "💰" },
  { id: "bonus", name: "Bonus", icon: "🎁" },
  { id: "refund", name: "Refund", icon: "🔁" },
  { id: "interest", name: "Interest", icon: "🏦" },
  { id: "income-other", name: "Other", icon: "📦" },
];

// A generic starter set of expense categories, most-common first.
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { id: "food", name: "Food", icon: "🍜" },
  { id: "traffic", name: "Traffic", icon: "🚗" },
  { id: "fun", name: "Fun", icon: "🎉" },
  { id: "groceries", name: "Groceries", icon: "🛒" },
  { id: "travel", name: "Travel", icon: "✈️" },
  { id: "insurance", name: "Insurance", icon: "🛡️" },
  { id: "health", name: "Health", icon: "💊" },
  { id: "family", name: "Family", icon: "👨‍👩‍👧" },
  { id: "other", name: "Other", icon: "📦" },
  { id: "clothes", name: "Clothes", icon: "👕" },
  { id: "cosmetics", name: "Cosmetics", icon: "💄" },
  { id: "learning", name: "Learning", icon: "📚" },
  { id: "social", name: "Social", icon: "🍻" },
  { id: "tax", name: "Tax", icon: "🧾" },
];
