# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision — its context, the
decision itself, and the consequences. ADRs are immutable once accepted: to
change a decision, add a new ADR that supersedes the old one.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-money-fixed-point-integer.md) | Money as a fixed-point ×100 integer | Accepted |
| [0002](0002-fx-locked-at-entry.md) | FX locked at entry (base-amount snapshot) | Accepted |
| [0003](0003-ledger-based-permissions.md) | Ledger-based permission model | Accepted |
| [0004](0004-soft-delete.md) | Soft delete instead of hard delete | Accepted |
| [0005](0005-financial-event-source-of-truth.md) | Financial Event as the single source of truth | Accepted |
| [0006](0006-i18n-from-day-one.md) | Internationalization (and unit testing) from day one | Accepted |

Template for each record: **Status · Context · Decision · Consequences · Rationale**.

Proposed but not yet written: the choice of **Firestore as the initial
persistence layer** (referenced in [../ARCHITECTURE.md](../ARCHITECTURE.md)).
