# Vault Architecture

> Architecture exists to protect the domain model.

This document describes how Vault is implemented.

Unlike the domain model defined in `SPEC.md`, the architecture is expected to evolve as technology changes. The purpose of the architecture is not to define the business domain, but to ensure that the implementation preserves the philosophy and principles of Vault.

---

# Relationship to Other Documents

Each document has a distinct responsibility.

| Document        | Responsibility                                  |
| --------------- | ----------------------------------------------- |
| README.md       | What Vault is                                   |
| PHILOSOPHY.md   | Why Vault is designed this way                  |
| SPEC.md         | Business domain and ubiquitous language         |
| ARCHITECTURE.md | System architecture and implementation strategy |
| DATA_MODEL.md   | Persistence model (Firestore)                   |
| ROADMAP.md      | Product evolution                               |

Implementation should always follow this order:

```
README
    ↓
PHILOSOPHY
    ↓
SPEC
    ↓
ARCHITECTURE
    ↓
DATA_MODEL
    ↓
CODE
```

---

# Architectural Principles

The architecture exists to preserve the principles defined in `PHILOSOPHY.md`.

## Domain First

The business domain is independent of infrastructure.

Firebase, Firestore, React, or any future technology are implementation choices.

The domain model should remain valid even if every technology is replaced.

---

## Offline First

Recording a Financial Event should not depend on network connectivity.

The application should continue to function when offline and synchronize automatically when connectivity returns.

The user should rarely need to think about synchronization.

---

## Cloud Native

Vault assumes that financial data belongs in the cloud.

Synchronization is automatic.

Devices are peers rather than primary or secondary copies.

---

## Infrastructure Is Replaceable

Infrastructure should never leak into business logic.

If Firestore is replaced by another database, the application logic should require minimal change.

---

## Simplicity Through Separation

Each architectural layer has one responsibility.

Keeping responsibilities separate reduces long-term maintenance costs and allows each part of the system to evolve independently.

---

# System Overview

Vault follows a layered architecture.

```
                User
                  │
                  ▼
        Presentation Layer
            (React / PWA)
                  │
                  ▼
        Application Layer
        (Use Cases / Services)
                  │
                  ▼
          Domain Layer
    (Financial Event Model)
                  │
                  ▼
       Repository Interfaces
                  │
                  ▼
   Infrastructure Layer
(Firestore / Authentication)
```

Dependencies always point downward.

Lower layers never depend on higher layers.

---

# Layer Responsibilities

## Presentation Layer

Responsible for user interaction.

Responsibilities include:

* Rendering the interface
* Handling user input
* Navigation
* Form validation
* Displaying projections

This layer should not contain business rules.

---

## Application Layer

Coordinates user actions.

Typical responsibilities include:

* Record Financial Event
* Edit Financial Event
* Delete Financial Event
* Load Timeline
* Load Monthly Summary

The Application Layer orchestrates workflows but does not define financial rules.

---

## Domain Layer

The heart of Vault.

Defines concepts such as:

* Ledger
* Timeline
* Financial Event
* Account
* Category
* Money

Business rules belong here.

This layer should have no knowledge of React, Firebase, or Firestore.

---

## Repository Layer

Defines the interface between the domain and persistence.

Examples:

* FinancialEventRepository
* AccountRepository
* CategoryRepository

The domain depends only on these abstractions.

---

## Infrastructure Layer

Provides concrete implementations.

Current implementations include:

* Cloud Firestore
* Firebase Authentication
* Firebase Hosting

Future implementations may replace these without changing the domain model.

---

# Data Flow

The typical lifecycle of a Financial Event is:

```
User
    ↓
Quick Entry Screen
    ↓
Application Service
    ↓
Domain Validation
    ↓
Repository
    ↓
Cloud Firestore
    ↓
Local Cache Updated
    ↓
Timeline Refresh
    ↓
Derived Projections
```

Every derived view is ultimately built from Financial Events.

No projection becomes a source of truth.

---

# Synchronization

Vault relies on Firestore's synchronization capabilities.

The architecture assumes:

* Local writes are available immediately.
* Remote synchronization occurs automatically.
* `createdAt` / `updatedAt` are server timestamps, authoritative for sync and conflict resolution.
* `date` is the user-facing event time (may be back-dated) and drives Timeline ordering — it is not used for conflict resolution.

Conflicts should be rare because users typically edit independent Financial Events.

When conflicts occur, the server becomes the source of truth.

---

# Offline Strategy

Offline support is considered a core architectural capability rather than a feature.

Design goals:

* Financial Events can always be recorded.
* Reads continue using local cache.
* Synchronization resumes automatically.
* Users rarely need to understand synchronization state.

The preferred experience is that offline usage feels identical to online usage.

---

# Security Model

Security is centered around the Ledger.

```
User
    │
Membership
    │
Ledger
    │
Everything inside the Ledger
```

Authorization is determined only by ledger membership.

This keeps security rules simple and scalable as shared ledgers are introduced.

Role-based permissions (Owner, Member) extend this model without changing its structure.

---

# Performance Strategy

Vault optimizes for perceived responsiveness.

Priority order:

1. Fast transaction entry
2. Instant timeline loading
3. Smooth scrolling
4. Automatic synchronization
5. Analytical queries

The architecture favors reducing user waiting time over minimizing backend operations.

---

# Evolution Strategy

Vault is expected to grow for many years.

Growth should occur by extending existing layers rather than redesigning them.

Examples:

* Investment tracking extends the Financial Event model.
* AI features consume projections instead of replacing them.
* Attachments extend Financial Events.
* Market data becomes another infrastructure service.

Future capabilities should integrate into the existing architecture rather than creating parallel systems.

---

# Technology Stack

Current implementation:

* React
* TypeScript
* Firebase Authentication
* Cloud Firestore
* Firebase Hosting
* Progressive Web App (PWA)

These technologies are implementation choices.

The architecture should remain valid even if any of them are replaced.

---

# Architectural Decision Records

Significant architectural decisions should be documented separately as ADRs.

Examples include:

* Money stored as scaled integers
* FX locked at entry
* Soft delete strategy
* Ledger-based authorization
* Firestore as the initial persistence layer

Keeping decisions separate prevents this document from becoming a historical log.

---

# Architecture Goal

The purpose of Vault's architecture is not to maximize technical sophistication.

Its purpose is to ensure that the product can continue to grow without requiring fundamental redesign.

Architecture should make future change easier—not harder.

Every implementation decision should preserve the philosophy, domain model, and long-term maintainability of Vault.
