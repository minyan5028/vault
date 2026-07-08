# Vault Data Model

> The persistence model for Vault.

This document defines how the domain model described in `SPEC.md` is persisted using Cloud Firestore.

Unlike `SPEC.md`, this document is implementation-specific. Collection layouts, document structures, indexes, and persistence strategies may evolve as technology changes.

---

# Relationship to Other Documents

| Document        | Responsibility        |
| --------------- | --------------------- |
| SPEC.md         | Business domain       |
| ARCHITECTURE.md | System architecture   |
| DATA_MODEL.md   | Firestore persistence |

The domain model defines **what** Vault is.

This document defines **how** it is stored.

---

# Persistence Principles

## Domain First

Firestore documents exist to persist the domain model.

The schema should never redefine business concepts already specified in `SPEC.md`.

---

## Denormalize Deliberately

Firestore favors read performance.

Frequently queried values may be duplicated intentionally.

Examples include:

* `yearMonth`
* `baseAmount`
* `baseCurrency`

These values are derived once when recording a Financial Event.

---

## Reality Never Changes

Every Financial Event stores exactly what happened.

Derived reports never reinterpret historical events using current exchange rates or current account settings.

---

# Collection Hierarchy

```text
users/{userId}

ledgers/{ledgerId}

ledgers/{ledgerId}/accounts/{accountId}

ledgers/{ledgerId}/categories/{categoryId}

ledgers/{ledgerId}/transactions/{transactionId}
```

Each Ledger owns all financial data beneath it.

This hierarchy allows authorization to be determined by ledger membership alone.

---

# Collection Schemas

## users/{userId}

Represents a Vault user.

| Field         | Type      | Description              |
| ------------- | --------- | ------------------------ |
| displayName   | string    | User display name        |
| email         | string    | Firebase Auth email      |
| defaultLedger | string    | Ledger opened by default |
| createdAt     | timestamp | Server timestamp         |

Future user preferences (theme, language, etc.) should be stored separately rather than expanding this document indefinitely.

---

## ledgers/{ledgerId}

Represents an independent financial context.

| Field          | Type      | Description                                         |
| -------------- | --------- | --------------------------------------------------- |
| name           | string    | Ledger name                                         |
| baseCurrency   | string    | ISO 4217                                            |
| members        | map       | userId → role (`owner` / `member`)                  |
| memberIds      | array     | Queryable mirror of `members` keys (array-contains) |
| invitedEmails  | array     | Lowercased emails invited but not yet joined        |
| memberProfiles | map       | userId → `{ name, email }`; each member self-registers their own, so others can attribute entries without reading private `users/{uid}` docs |
| createdBy      | string    | Owner                                               |
| createdAt      | timestamp | Server timestamp                                    |

Example:

```json
{
  "members": { "uid123": "owner", "uid456": "member" },
  "memberIds": ["uid123", "uid456"],
  "invitedEmails": [],
  "memberProfiles": {
    "uid123": { "name": "Alice", "email": "alice@example.com" },
    "uid456": { "name": "Bob", "email": "bob@example.com" }
  }
}
```

---

## accounts/{accountId}

Represents an Account defined in `SPEC.md`.

Balances are always derived from Financial Events.

Never store running balances.

| Field     | Type    | Description          |
| --------- | ------- | -------------------- |
| name      | string  | User-defined         |
| type      | string  | Optional free label  |
| currency  | string  | ISO 4217             |
| archived  | boolean | Hidden but preserved |
| sortOrder | number  | UI ordering          |

Examples:

* General
* Travel
* Emergency
* Brokerage

---

## categories/{categoryId}

| Field     | Type             |
| --------- | ---------------- |
| name      | string           |
| type      | expense | income |
| icon      | string           |
| parentId  | string | null    |
| archived  | boolean          |
| sortOrder | number           |

Categories classify Financial Events.

Deleting or archiving a category must never remove historical data.

---

## transactions/{transactionId}

Represents a Financial Event.

| Field        | Type             | Description                                      |
| ------------ | ---------------- | ------------------------------------------------ |
| type         | string           | expense / income / transfer / future event types |
| amount       | integer          | Original amount ×100                             |
| currency     | string           | Original currency                                |
| baseAmount   | integer          | Converted amount in ledger currency              |
| baseCurrency | string           | Ledger currency                                  |
| fxRate       | number           | Exchange rate captured at entry                  |
| date         | timestamp        | When it happened                                 |
| yearMonth    | string           | YYYY-MM                                          |
| categoryId   | string | null    | Null for transfers                               |
| accountId    | string           | Source account                                   |
| toAccountId  | string | null    | Destination account                              |
| title        | string           | Primary description                              |
| note         | string | null    | Optional note                                    |
| createdBy    | string           | User ID                                          |
| createdAt    | timestamp        | Server timestamp                                 |
| updatedAt    | timestamp        | Server timestamp                                 |
| deletedAt    | timestamp | null | Soft delete                                      |
| source       | string | null    | Provenance, e.g. `"notion-import"` (optional)    |

---

# Money Representation

Money is stored as scaled integers.

```
stored = displayed × 100
```

Examples:

| Display   |  Stored |
| --------- | ------: |
| NT$149.90 |   14990 |
| US$10.25  |    1025 |
| ¥16,000   | 1600000 |

Floating-point values are never authoritative.

Currencies requiring more than two decimal places are intentionally unsupported.

---

# Foreign Currency

Every Financial Event stores:

* Original amount
* Original currency
* Base amount
* Base currency
* Exchange rate

Example:

```text
Original:
JPY 16,000

↓

FX captured

↓

Base:
TWD 3,536.00
```

Reports always aggregate `baseAmount`.

Historical totals never change when exchange rates move.

---

# Transaction Rules

## Amounts are always positive

Direction is determined by `type`.

Examples:

Expense — NT$5.00

```
amount = 500      // stored value (×100)
type   = expense
```

Income — NT$5.00

```
amount = 500      // stored value (×100)
type   = income
```

Transfers move value between two accounts and do not belong to a spending category.

A transfer is a **single** Financial Event affecting two accounts: it decreases
`accountId` and increases `toAccountId` by the same `amount`. Balance derivation
treats it as −amount on the source and +amount on the destination. Cross-currency
transfers (accounts in different currencies) are a deferred edge case.

---

## Soft Delete

Financial Events are never immediately removed.

Deletion sets:

```
deletedAt = timestamp
```

This preserves auditability and allows recovery.

---

# Query Patterns

## Current Month

```
yearMonth == "2026-07"
deletedAt == null
orderBy(date desc)
```

---

## Monthly Spending

Filter:

* yearMonth
* deletedAt

Aggregate:

```
SUM(baseAmount)
```

Never aggregate mixed currencies directly.

---

## Timeline

```
deletedAt == null
orderBy(date desc)
```

Grouped by day in the UI. Soft-deleted events are always excluded.

---

# Composite Indexes

Required indexes include:

| Collection   | Fields                                  |
| ------------ | --------------------------------------- |
| transactions | yearMonth ASC, deletedAt ASC, date DESC |

Additional indexes should only be introduced when justified by real query patterns.

---

# Security Model

Authorization is ledger-based.

A user may read or modify data beneath a Ledger only if they are a member of that Ledger.

Roles determine administrative capabilities.

Current roles:

* owner
* member

---

# Seed Data

Historical Notion data is migrated into this model.

Migration pipeline:

```
Notion Export

↓

Migration Script

↓

vault-seed.json

↓

Admin SDK Loader

↓

Cloud Firestore
```

The migration preserves:

* Accounts
* Categories
* Financial Events
* Historical timestamps

---

# Future Extensions

Future phases extend this model without restructuring existing collections.

Examples include:

* Attachments (Firebase Storage)
* Tags
* Investment holdings
* Asset lots
* Market price snapshots

Existing Financial Events remain unchanged.

---

# Data Model Goals

The persistence layer should satisfy four requirements:

* Faithfully preserve financial reality
* Keep common queries efficient
* Remain understandable years later
* Evolve without requiring destructive migrations

A Financial Event recorded today should remain meaningful decades into the future.
