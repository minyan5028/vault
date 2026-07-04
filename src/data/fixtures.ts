/**
 * Dev fixtures: the real 6 accounts and 14 categories from the Notion seed, so
 * the Quick Entry screen is fully usable before Firebase is wired up. These are
 * *data* (user-defined in the real app, loaded from Firestore) — their names are
 * NOT translated; only UI chrome goes through i18n.
 *
 * Categories are ordered by real usage frequency (Food dominates at 62%) so the
 * most-used ones surface first, per docs/UX.md.
 */

export interface AccountFixture {
  id: string;
  name: string;
  currency: string;
}

export interface CategoryFixture {
  id: string;
  name: string;
  icon: string;
}

export const SEED_ACCOUNTS: AccountFixture[] = [
  { id: "general", name: "General", currency: "TWD" },
  { id: "dream", name: "Dream", currency: "TWD" },
  { id: "fixed", name: "Fixed", currency: "TWD" },
  { id: "couple-s", name: "Couple's", currency: "TWD" },
  { id: "savings", name: "Savings", currency: "TWD" },
  { id: "investment", name: "Investment", currency: "TWD" },
  { id: "advanced", name: "Advanced", currency: "TWD" },
  { id: "us-stock-investment", name: "US Stock Investment", currency: "TWD" },
  { id: "jpy-investment", name: "JPY Investment", currency: "TWD" },
  { id: "nt-stock-investment", name: "NT Stock Investment", currency: "TWD" },
];

// Ordered by frequency (descending) from the 3-year seed analysis.
export const SEED_CATEGORIES: CategoryFixture[] = [
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
