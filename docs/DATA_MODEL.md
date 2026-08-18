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

## Derived rollups (rebuildable caches)

Transactions stay the single source of truth. To avoid reading thousands of
them on every screen, two aggregates are **maintained on write** (atomic
`increment`s inside the same batch/transaction as the event) and can be rebuilt
from scratch at any time — they are caches, not authority.

**`meta/balances`** — one doc, `{ netFlow: { accountId: minorUnits } }`, the net
per-account flow for the Assets page. Repair: `scripts/recompute_balances.mjs`.

**`rollups/{yearMonth}`** — one doc per month for Stats/trends:

| Field            | Type   | Description                                  |
| ---------------- | ------ | -------------------------------------------- |
| yearMonth        | string | `yyyy-mm` (also the doc id; queryable range) |
| income           | number | Sum of income `baseAmount` (minor units)     |
| expense          | number | Sum of expense `baseAmount`                  |
| expenseByCategory| map    | categoryId → minor units (`uncategorized` if null) |
| incomeByCategory | map    | categoryId → minor units                     |
| expenseByProject | map    | projectId → minor units; **sparse**          |
| incomeByProject  | map    | projectId → minor units; **sparse**          |

The project maps are **sparse: a transaction with no project contributes no key
at all.** `UNCATEGORIZED` exists because the category map is fanned out into a
donut where every slice needs a key; these are an exception list, typically
holding zero to two entries a month. Everyday spending is therefore a
subtraction — `expense − Σ expenseByProject` — which is what stops it ever
disagreeing with the headline total.

The set of breakdown maps is declared once, as `BREAKDOWNS` in
`domain/types.ts`. Every fold over them — accumulating, summing months, deciding
whether a change is worth writing, turning one into increments — iterates that
list rather than naming each map, so a new dimension cannot be added to half the
pipeline. That matters most for the zero-check: an edit that only moves a
transaction between projects changes neither amount nor category, and a map
missing from the check would make a real change look like no change at all.

Transfers are excluded (they move money between accounts, not income/expense).
An edit that crosses a month boundary decrements the old month and increments
the new. Repair/backfill: `scripts/recompute_rollups.mjs`. The maintenance lives
in `transactionRepo`; the pure aggregation math (unit-tested) in `lib/rollup.ts`.

---

## accounts/{accountId}

Represents an Account defined in `SPEC.md`.

Balances are always derived from Financial Events.

Never store running balances (except the rebuildable rollup cache above).

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

## projects/{projectId}

A **Project** — a bounded, non-daily episode of spending that spans several
categories (SPEC.md, ADR-0009). The second classification axis: a category says
what kind of money an event is, a project says which episode it belonged to.

A project holds no money. It has no balance, is never an endpoint, and never
enters net worth.

| Field      | Type      | Description                                          |
| ---------- | --------- | ---------------------------------------------------- |
| name       | string    | User-defined                                         |
| startDate  | timestamp | Display, and the range a backfill would use          |
| endDate    | timestamp | **Mandatory.** Extendable, never absent              |
| autoAssign | boolean   | Stamp new manual entries; at most one per ledger     |
| deletedAt  | timestamp \| null | Soft delete (ADR-0004)                      |
| createdAt  | timestamp | Server timestamp                                     |
| updatedAt  | timestamp | Server timestamp                                     |

**Lifecycle is derived, never stored.** A project is in progress while today is
on or before `endDate`, and ended afterwards — compared by calendar day, since
`endDate` is stored at local midnight (`lib/project.ts`). There is no `status`
field and no `archived` flag: a category needs `archived` because it has no end,
a project has one.

**At most one project per ledger may have `autoAssign` set.** Turning it on for
one project turns it off for any other *in the same write* — see
`planSetAutoAssign` in `data/writes.ts`, which is where the invariant is decided
and unit-tested. An ended project never stamps, whatever the flag says.

Deleting is soft, and transactions keep their `projectId`: history is not
rewritten because the catalog changed, exactly as when a category is archived.

---

## transactions/{transactionId}

Represents a Financial Event.

| Field        | Type             | Description                                      |
| ------------ | ---------------- | ------------------------------------------------ |
| type         | string           | expense / income / transfer / future event types |
| amount       | integer          | Original amount ×100 (debited from `accountId`)  |
| currency     | string           | Original currency                                |
| toAmount     | integer          | Amount credited to `toAccountId` in its own currency; differs from `amount` only on a cross-currency transfer, else equals it |
| baseAmount   | integer          | Converted amount in ledger currency              |
| baseCurrency | string           | Ledger currency                                  |
| fxRate       | number           | Exchange rate captured at entry                  |
| date         | timestamp        | When it happened                                 |
| yearMonth    | string           | YYYY-MM                                          |
| categoryId   | string | null    | Null for transfers                               |
| projectId    | string | null    | The Project this event belongs to; null for everyday spending — the norm (ADR-0009) |
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

## holdings/{holdingId}

A market-valued position (stock, ETF, forex) whose worth is set by the market,
not derived from cash-flow events. Buy-and-hold with periodic snapshots; DRIP
grows `shares`. Cost basis follows the **average-cost** method.

| Field        | Type    | Description                                        |
| ------------ | ------- | -------------------------------------------------- |
| ticker       | string  | Symbol                                             |
| class        | string  | `growth` / `dividend`                              |
| currency     | string  | The holding's own currency                         |
| cost         | integer | Cost basis of the shares held ×100                 |
| shares       | integer | ×10000 (4 dp; fractional from DRIP)                |
| price        | integer | Latest price ×100 (denormalized from a snapshot)   |
| realizedGain | integer | Cumulative realized gain from sells ×100           |
| dividendReceived | integer | Cumulative dividends received ×100 — reference only (reinvested, so already in shares; not in cost or net worth) |
| targetPrice  | integer | null | Optional re-evaluation threshold ×100       |
| buyDate      | timestamp | null | When first opened                          |
| archived     | boolean | Hidden but preserved                               |

A buy debits a cash account into the holding, a sell moves proceeds back — both
recorded as `transfer` transactions, so the holding's id acts as a (non-listed)
transfer endpoint and net worth never double-counts deposited cash + value.

### holdings/{holdingId}/trades/{tradeId}

Append-only buy/sell log: `kind` (buy/sell), `date`, `shares`, `price`,
`amount` (cash moved), `realized` (0 for a buy).

## snapshots/{date}

A portfolio valuation on one date: `{ date, entries: { holdingId: { price,
shares } }, fx }`. Partial (per-currency) updates merge into the same date.

## meta/fx

Current exchange rates + when they were last set:
`{ rates: { currency: rate-into-TWD }, updatedAt: timestamp }`. Used **only** to
value foreign accounts/holdings into the base currency for net worth —
historical transactions keep their entry-locked fxRate (ADR-0002).

Rates come from the manual editor (Manage → Exchange rates) or a **weekly
auto-refresh**: on app load, if `updatedAt` is before the current week's Monday
midnight, the app fetches current rates for the in-use foreign currencies from a
free public API (open.er-api.com) and updates them. Client-triggered (Vault has
no backend), so the fetch lands the first app-open each week (~Mon/Tue).

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

## Multi-currency accounts

An account holds one currency; its **balance is in that currency**, accumulated
from `amount` (source leg) and `toAmount` (destination leg) — not `baseAmount`.
A cross-currency transfer moves `amount` out of the source and `toAmount` into
the destination (two different figures + the rate).

Two FX regimes coexist deliberately:

* **Income/expense stats** aggregate `baseAmount`, the rate **locked at entry**
  (ADR-0002) — history stays deterministic.
* **Net worth** values each account/holding balance at the **current** rate
  from `meta/fx` — it reflects today's market. A foreign balance therefore
  shows e.g. `US$2,145.44 × 32 = NT$68,654.08`.

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
* Buy lots (per-lot cost basis, superseding today's average-cost method)

Investment holdings, trades, price snapshots and multi-currency accounts are now
implemented (see the schemas above). Existing Financial Events remain unchanged.

---

# Data Model Goals

The persistence layer should satisfy four requirements:

* Faithfully preserve financial reality
* Keep common queries efficient
* Remain understandable years later
* Evolve without requiring destructive migrations

A Financial Event recorded today should remain meaningful decades into the future.
