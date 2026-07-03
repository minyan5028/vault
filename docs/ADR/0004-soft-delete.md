# ADR-0004: Soft Delete Instead of Hard Delete

## Status

Accepted

## Context

Financial data is audit-sensitive: corrections happen, mistakes occur, and users
expect history to be stable. Hard delete introduces data-loss risk, report
inconsistency, and broken audit trails.

## Decision

Financial Events are never physically deleted. Deletion sets:

```
deletedAt = <timestamp>
```

Soft-deleted records are excluded from every query (`deletedAt == null`).

## Consequences

**Positive**

- Full history is preserved; safe recovery is possible.
- Reporting logic stays consistent.

**Negative**

- Data size grows over time.
- Every query must filter `deletedAt`.
- "Deleted" items still exist physically.

## Rationale

In financial systems, deletion is a user-interface concept, not a data concept.
