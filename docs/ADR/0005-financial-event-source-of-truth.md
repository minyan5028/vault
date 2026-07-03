# ADR-0005: Financial Event as the Single Source of Truth

## Status

Accepted

## Context

Vault has many derived systems: budgets, analytics, net worth, projections, and
AI summaries. The risk is that derived data gets treated as primary data, so
inconsistencies creep in and cannot be reconciled.

## Decision

Only Financial Events are authoritative; everything else is derived and
disposable.

Vault uses a **loose** event model: events are the source of truth but remain
**editable and soft-deletable** (see [ADR-0004](0004-soft-delete.md)). This is
deliberately *not* strict, append-only event sourcing — a correction edits the
event in place rather than posting a compensating entry.

## Consequences

**Positive**

- A single source of truth; derived views can always be recomputed.
- Reduced data-inconsistency risk.

**Negative**

- Derived data needs recomputation logic and cannot be trusted as permanent.
- Editing an event mutates history in place — acceptable for a personal tool,
  but it is not an immutable audit ledger.

## Rationale

Reality is recorded once; everything else is interpretation. The loose model
keeps an everyday correction (e.g. fixing a lunch amount) a one-tap edit instead
of an accounting-style reversal — consistent with the 3-second common path.
