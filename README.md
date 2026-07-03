# Vault

> Build once. Use for life.

## Why Vault

I've kept a habit of tracking every expense for years, but no tool has fit for the long run:

- **Money Manager (Expense & Budget)** was fast and pleasant to use, but had no online sync or shared editing — so it couldn't grow with a family.
- **Notion** solved sync and sharing, but it's the wrong tool for the job. Its general-purpose data model makes every table slow to load, and recording a transaction became a chore.

Recording an expense should feel instant. Data should sync so more than one person can use it. And the tool should be simple enough to keep running for years without heavy maintenance.

Vault is my attempt to build that — starting as an expense tracker for myself, and growing into a finance system my future family can share.

---

## Philosophy

- **Fast** — Recording a transaction should take less than 3 seconds.
- **Low maintenance** — Simple enough for one person to keep alive for 10+ years.
- **Cloud native** — Synced across devices so it can be shared, not locked to one phone.
- **Scalable** — Starts as an expense tracker and grows into a full personal finance system.
- **AI pending** — Built with future AI-powered financial analysis in mind.

---

## Vision

Vault is not just another expense tracker. The goal is a single, long-lived home for personal financial data — from daily transactions and budgeting to assets, investments, and long-term insights — that can be used every day for the next 10+ years.

---

## Core Principles

- Mobile-first experience
- Fast and frictionless transaction recording
- Cloud sync for multi-device and shared family use
- Long-term maintainability over feature count
- Extensible, modular design

---

## Roadmap

### Phase 0 — Planning & Architecture
Define the data model, tech stack, and the core "record in under 3 seconds" flow.

### Phase 1 — Core Expense Tracking (MVP)
The smallest version worth using every day.

- Add / edit / delete a transaction (amount, category, date, note)
- Category management
- Simple monthly list and total
- Auth and cloud sync

_Out of scope for MVP: budgets, reports, multi-user sharing, investments._

### Phase 2 — Analytics, Budgeting & Reporting
Monthly summaries, budgets, and spending insights.

### Phase 3 — Shared Family Finance
Multiple people recording into a shared space.

### Phase 4 — Asset & Investment Management
Track accounts, assets, and investments.

### Phase 5 — AI-Powered Financial Assistant
Natural-language insights and analysis over your financial history.

---

## Tech Stack

- React
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Progressive Web App (PWA)

Firebase is chosen deliberately to keep operational overhead near zero — no servers to run or maintain for a single-user start.

---

## Getting Started

> Setup instructions will be added once the Phase 1 scaffold lands.

```bash
# Coming soon
```

---

## Project Status

🚧 Phase 0 — planning and architecture. No application code yet.
