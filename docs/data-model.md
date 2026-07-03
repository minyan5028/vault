# Vault — Data Model (Draft)

Status: **Phase 0 draft.** For discussion, not final.

This models the Firestore structure for Phase 1 (MVP), designed so Phase 3
(shared family finance) needs no painful migration.

---

## Design decisions

1. **Money is stored as integer minor units** (e.g. cents), never floats.
   `149.90 TWD` → `amount: 14990`. Floating point accumulates rounding errors
   in financial math — this avoids it entirely. Format to decimal only in the UI.
2. **Everything lives under a `ledger`** (a "book"). The MVP has exactly one
   ledger per user, but wrapping data in a ledger now means family sharing
   (Phase 3) is just adding members — no restructuring later.
3. **`date` (when it happened) is separate from `createdAt` (when it was
   written).** You may record yesterday's lunch today; reports use `date`.
4. **A `yearMonth` string (`"2026-07"`) is denormalized onto each transaction**
   so "show me this month" is a single cheap equality filter, not a range scan.

---

## Collections

```
users/{userId}
ledgers/{ledgerId}
ledgers/{ledgerId}/accounts/{accountId}
ledgers/{ledgerId}/categories/{categoryId}
ledgers/{ledgerId}/transactions/{transactionId}
```

Sub-collections keep each ledger's data isolated, which makes security rules
simple: "you can read/write a ledger's data if you're a member of that ledger."

---

## `users/{userId}`

The person, independent of any ledger.

| Field           | Type      | Notes                                  |
|-----------------|-----------|----------------------------------------|
| `displayName`   | string    |                                        |
| `email`         | string    | from Firebase Auth                     |
| `defaultLedger` | string    | ledgerId to open on launch             |
| `createdAt`     | timestamp | server timestamp                       |

---

## `ledgers/{ledgerId}`

A book of accounts. One per user in MVP; shareable later.

| Field           | Type                     | Notes                                    |
|-----------------|--------------------------|------------------------------------------|
| `name`          | string                   | e.g. "Personal", "Family"                |
| `baseCurrency`  | string                   | ISO 4217, e.g. `"TWD"`                   |
| `members`       | map<userId, role>        | `{ "uid123": "owner" }`. MVP: just you.  |
| `createdBy`     | string (userId)          |                                          |
| `createdAt`     | timestamp                |                                          |

`members` as a map (not a sub-collection) lets a security rule check
membership in one read.

---

## `ledgers/{ledgerId}/accounts/{accountId}`

Where money sits — cash, bank, credit card. (Can defer to a single default
"Cash" account in the very first MVP cut if you want to ship faster.)

| Field       | Type      | Notes                                        |
|-------------|-----------|----------------------------------------------|
| `name`      | string    | "Cash", "Bank", "Visa"                       |
| `type`      | string    | `cash` \| `bank` \| `credit` \| `other`      |
| `currency`  | string    | ISO 4217                                     |
| `archived`  | boolean   | hide without deleting history                |
| `sortOrder` | number    | display order                                |

Balances are **derived** from transactions, not stored, to avoid drift.

---

## `ledgers/{ledgerId}/categories/{categoryId}`

| Field       | Type      | Notes                                     |
|-------------|-----------|-------------------------------------------|
| `name`      | string    | "Food", "Transport"                       |
| `type`      | string    | `expense` \| `income`                     |
| `icon`      | string    | emoji or icon key (optional)              |
| `parentId`  | string    | for sub-categories; null at top level     |
| `archived`  | boolean   |                                           |
| `sortOrder` | number    |                                           |

---

## `ledgers/{ledgerId}/transactions/{transactionId}`  ← the core

| Field          | Type            | Notes                                                     |
|----------------|-----------------|-----------------------------------------------------------|
| `type`         | string          | `expense` \| `income` \| `transfer`                       |
| `amount`       | integer         | minor units, always positive                              |
| `currency`     | string          | ISO 4217                                                  |
| `date`         | timestamp       | when the transaction happened (user-facing)               |
| `yearMonth`    | string          | `"2026-07"`, derived from `date`                          |
| `categoryId`   | string          | null for transfers                                        |
| `accountId`    | string          | source account                                            |
| `toAccountId`  | string          | destination account; only for `transfer`                 |
| `note`         | string          | optional free text                                        |
| `createdBy`    | string (userId) | who recorded it (matters once shared)                     |
| `createdAt`    | timestamp       | server timestamp                                          |
| `updatedAt`    | timestamp       | server timestamp                                          |
| `deletedAt`    | timestamp\|null | soft delete — keeps history recoverable                   |

### Notes on the transaction shape

- **`amount` is always positive.** Direction comes from `type`, not the sign.
  This keeps sums unambiguous.
- **Transfers** (`type: "transfer"`) move money between your own accounts and
  are *not* income or expense — reports should exclude them from spend totals.
  They use `accountId` → `toAccountId` and have no category.
- **Soft delete** (`deletedAt`) instead of hard delete so a misfire is
  recoverable and history stays intact. Queries filter `deletedAt == null`.

---

## Example documents

Expense — a NT$149.90 lunch:

```json
{
  "type": "expense",
  "amount": 14990,
  "currency": "TWD",
  "date": "2026-07-03T12:30:00+08:00",
  "yearMonth": "2026-07",
  "categoryId": "food",
  "accountId": "cash",
  "toAccountId": null,
  "note": "Lunch with A",
  "createdBy": "uid123",
  "createdAt": "2026-07-03T12:31:05Z",
  "updatedAt": "2026-07-03T12:31:05Z",
  "deletedAt": null
}
```

Transfer — NT$5,000 from bank to cash:

```json
{
  "type": "transfer",
  "amount": 500000,
  "currency": "TWD",
  "date": "2026-07-03T09:00:00+08:00",
  "yearMonth": "2026-07",
  "categoryId": null,
  "accountId": "bank",
  "toAccountId": "cash",
  "note": "ATM withdrawal",
  "createdBy": "uid123",
  "createdAt": "2026-07-03T09:00:12Z",
  "updatedAt": "2026-07-03T09:00:12Z",
  "deletedAt": null
}
```

---

## Common queries (MVP)

- **This month's transactions:**
  `where yearMonth == "2026-07" and deletedAt == null order by date desc`
- **Monthly total by category:** same filter, aggregate client-side (small N),
  or maintain a monthly rollup doc later if it gets large.

Firestore composite index needed: `(yearMonth asc, deletedAt asc, date desc)`.

---

## Open questions to decide

1. **Multi-currency now or later?** Every doc carries `currency`, but true
   multi-currency reporting (FX rates) is complex. Recommend: store the field
   now, but assume single `baseCurrency` for MVP math.
2. **Denormalize category/account names onto transactions?** It speeds up list
   rendering (no extra reads) but names then go stale on rename. Recommend:
   *don't* denormalize for MVP — categories/accounts are few and easily cached.
3. **Accounts in the first cut?** You can ship with a single implicit account
   and add the accounts collection in a fast follow, to hit "usable every day"
   sooner. Recommend deciding based on whether you track more than cash today.
```

