# ADR-0003: Ledger-Based Permission Model

## Status

Accepted

## Context

Vault supports personal finance, shared finance (couple / family), and future
multi-context financial systems. A naive model — per-account permissions or
per-transaction ACLs — creates a complexity explosion in authorization.

## Decision

Permissions are defined at the **Ledger** level only:

```
User → member of a Ledger → full access to that Ledger's data
```

Membership is a `members` map on the ledger with roles `owner` and `member`.
All data beneath a ledger inherits its permissions. Sharing a subset of finances
is achieved by putting it in a **separate ledger**, not by per-account rules.

## Consequences

**Positive**

- Simple, Firestore-friendly security rules (one membership check).
- Easy to reason about; scales cleanly to multi-user sharing.
- No per-document ACL complexity.

**Negative**

- No per-account privacy inside a ledger.
- No partial sharing of individual accounts.
- Different sharing contexts require separate ledgers.

## Rationale

Security complexity is a long-term liability. Vault prefers structural
simplicity over granular flexibility.
