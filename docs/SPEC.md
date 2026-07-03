# Vault Specification

This document defines the domain model of Vault.

It intentionally avoids implementation details.

Databases, frameworks, APIs, and programming languages may change.

The domain model should not.

---

## Purpose

Vault is a Financial Operating System.

Its responsibility is to faithfully record financial reality and provide a stable foundation for every financial capability built on top of it.

Everything in Vault begins with recorded financial events.

---

## Domain Model

```
Vault
    └── Ledger
            └── Timeline
                    └── Financial Event
```

Every capability in Vault is built upon this hierarchy.

---

## Vault

A Vault represents a user's complete financial system.

A Vault contains one or more Ledgers.

The Vault itself does not store financial events.

It organizes them.

---

## Ledger

A Ledger represents an independent financial context.

Examples:

* Personal
* Family
* Travel
* Wedding
* Business

Each Ledger owns its own financial timeline.

Permissions are granted at the Ledger level.

A user may participate in multiple Ledgers.

---

## Timeline

A Timeline is the chronological history of a Ledger.

It is immutable in meaning.

Events may be edited or deleted according to product rules, but conceptually the Timeline represents everything that has happened inside the Ledger.

Every report in Vault is ultimately derived from a Timeline.

---

## Financial Event

A Financial Event records something that actually happened.

Examples include:

* Expense
* Income
* Transfer
* Dividend
* Asset Purchase
* Asset Sale
* Interest
* Refund

New event types may be introduced without changing the overall model.

Financial Events are the source of truth.

---

## Money

Money is stored as an exact monetary value.

Floating-point representations are never considered authoritative.

Every monetary value belongs to exactly one currency.

When a value is recorded in a foreign currency, the exchange rate at that moment is captured, fixing the event's worth in the base currency.

Derived reports sum those already-converted values instead of re-converting later, so past totals never shift as rates move.

---

## Account

An Account is a container that value is grouped under.

It may be a physical store of value or a user-defined purpose bucket. Account names are free-form — not a fixed set of types.

Examples:

* Cash
* Bank Account
* A travel fund
* A shared household bucket
* Brokerage

Accounts participate in Financial Events.

Accounts are not owners of events.

Ledgers own events.

---

## Category

Categories classify Financial Events.

Categories exist to improve understanding.

They never change the meaning of an event.

Categories may evolve over time.

Historical events should remain meaningful regardless of category changes.

---

## Tags

Tags provide optional user-defined classifications.

Tags are intentionally lightweight.

They should never become required for understanding financial history.

---

## Attachments

Attachments provide supporting information.

Examples include:

* Receipts
* Statements
* Images

Attachments supplement Financial Events.

They never replace them.

---

## Source of Truth

The only authoritative data inside Vault is recorded Financial Events.

Everything else is derived.

Examples of derived information include:

* Monthly summaries
* Budgets
* Net worth
* Investment performance
* Spending trends
* AI analysis

Derived information may be regenerated at any time.

Financial Events cannot.

---

## Projections

A Projection is any view generated from Financial Events.

Examples:

* Reports
* Charts
* Budgets
* Dashboards
* Search results
* AI summaries

Projections should never introduce facts not supported by recorded events.

---

## Design Invariants

The following rules should always remain true.

### Reality First

Every Financial Event represents something that actually happened.

---

### Events Are the Record of Reality

Financial Events are the authoritative record of what happened.

They may be edited to correct a mistake or soft-deleted according to product rules, but they are never casually rewritten, and derived data is never treated as more authoritative than the events themselves.

---

### Derived Data Is Disposable

Reports may be rebuilt.

Budgets may be recalculated.

Indexes may be regenerated.

Financial Events remain authoritative.

---

### Ledgers Are Independent

No Ledger depends on another Ledger.

Sharing happens through membership.

Not through cross-ledger ownership.

---

### Categories Never Own Data

Categories classify.

They do not define financial reality.

Deleting a category must never destroy financial history.

---

### Accounts Group Value

Accounts describe how value is grouped — a physical store or a purpose bucket.

Financial Events describe why it changed.

---

### Time Is Fundamental

Every Financial Event belongs to a specific moment in time.

Timeline order is part of financial reality.

---

### Future Compatibility

The model should accommodate future Financial Event types without structural redesign.

New capabilities should extend the model rather than replace it.
