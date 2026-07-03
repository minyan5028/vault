# Vault

> **Build once. Grow for life.**

Vault is a **Financial Operating System** built around **Financial Events**.

It begins as an expense tracker, but expense tracking is only the first capability of a much larger system. Vault is designed to become a long-lived home for personal financial data—from daily spending and shared household finances to investments, net worth, and AI-powered financial insights.

Rather than optimizing for a single stage of life, Vault is designed to evolve through every stage of it.

---

## Why Vault Exists

Most financial software solves one problem well.

Some applications are excellent expense trackers.

Others focus on budgeting.

Others specialize in investments.

Others support family finance.

As life changes, users eventually outgrow one tool and migrate to another.

Financial history becomes fragmented across multiple applications.

**Vault exists because financial software shouldn't be replaced every time life changes.**

Instead, Vault is designed to grow through every phase of life while preserving a single, continuous financial history.

---

## What Vault Is

Vault is **not just** an expense tracker.

Expense tracking is simply the first capability built on top of Vault's financial event model.

At its core, Vault records **Financial Events**.

Examples include:

* Expenses
* Income
* Transfers
* Dividends
* Asset purchases
* Asset sales
* Interest
* Refunds
* Future financial event types

Everything else—budgets, reports, charts, investment performance, AI insights—is derived from those recorded events.

Financial events are the source of truth.

---

## Design Philosophy

Vault follows one central principle:

> **Optimize the common path. Enable the uncommon path.**

Daily actions should require almost no thought.

Advanced financial workflows should remain available without making everyday usage more complicated.

Examples:

* Recording lunch should take less than three seconds.
* Reviewing yearly investment performance may take several minutes.
* Creating a shared family ledger may require multiple setup steps.

Complexity is acceptable.

Unnecessary friction is not.

---

## Core Principles

### Reality First

Vault records what actually happened.

Budgets, analytics, forecasts, and AI are all built on top of recorded financial events—not the other way around.

---

### Fast Where It Matters

The most common workflows must remain extremely fast.

Every new feature should preserve the speed of daily expense entry.

---

### Simple by Design

Vault is intentionally designed to support sophisticated financial workflows.

Complexity is managed through architecture and user experience—not by removing capability.

---

### Grow Without Migration

Users should not need different software as their financial life becomes more complex.

Vault grows alongside its owner.

---

### Own Your Data

Financial history belongs to the user.

Importing and exporting data should always remain possible.

No proprietary lock-in.

---

### Built for Decades

Technology choices prioritize maintainability over trends.

Vault is intended to remain useful for many years—not just until the next framework becomes popular.

---

## Long-Term Vision

Vault aims to become a complete financial operating system.

Its capabilities will gradually expand through multiple stages:

* Expense Tracking
* Shared Finance
* Budgeting & Analytics
* Net Worth
* Investment Tracking
* Financial Intelligence
* AI Assistant

Each capability builds upon the same underlying financial event model.

No redesign.

No migration.

Only growth.

---

## Current Status

Vault is currently in **Phase 0 — Architecture & Product Design**.

The project is focused on establishing:

* Product philosophy
* Domain model
* Technical architecture
* User experience
* Long-term maintainability

Implementation begins only after the foundations are complete.

---

## Technology

Vault is built with a cloud-native architecture designed to minimize operational overhead.

Current technology choices:

* React
* Firebase Authentication
* Cloud Firestore
* Firebase Hosting
* Progressive Web App (PWA)

This stack allows Vault to focus on product design instead of server maintenance.

---

## Documentation

Project documentation is organized into several living documents.

| Document | Purpose | Status |
| --- | --- | --- |
| [README.md](README.md) | Product overview | ✅ |
| [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) | Design philosophy and guiding principles | ✅ |
| [docs/SPEC.md](docs/SPEC.md) | Domain model and ubiquitous language (implementation-free) | ✅ draft |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and implementation strategy | ✅ draft |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Persistence model — Firestore schema, indexes, money rules | ✅ draft |
| [docs/UX.md](docs/UX.md) | UX specification — the 3-second quick-entry path | ✅ draft |
| [docs/ADR/](docs/ADR/) | Architecture Decision Records | ✅ |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Product development roadmap | ✅ |
| [docs/phase-1-tasks.md](docs/phase-1-tasks.md) | Phase 1 executable task list | ✅ |

Together, these documents define Vault more accurately than the implementation itself.

---

## Mission

> **Build once. Grow for life.**

Vault is designed to become the last financial system you'll ever need—not because it already supports everything, but because it is built to grow with you instead of being replaced.
