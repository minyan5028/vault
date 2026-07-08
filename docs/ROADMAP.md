# Vault — Detailed Roadmap

Working plan for building Vault. The README keeps the one-line summary; this is
the detailed breakdown. Sizes are T-shirt estimates (S/M/L), not dates —
solo build, so sequence matters more than calendar.

Guiding rule: **ship the smallest thing that replaces the current tool, then
grow.** Don't build toward Phase 5 before Phase 1 is used daily.

Legend: ✅ done · 🔜 next · ⬜ not started

---

## Phase 0 — Planning & Architecture

**Goal:** lock foundations so Phase 1 is built without rework.

| Item | Size | Status |
|------|------|--------|
| README (vision, principles, stack) | S | ✅ |
| Data model spec (`docs/SPEC.md`) | M | ✅ |
| Money model decided (×100 integer, FX at entry) | M | ✅ |
| Notion migration script + seed JSON (3,144 txns) | M | ✅ |
| Firebase project created (Auth + Firestore + Hosting) | S | ✅ |
| Firestore **security rules** (ledger-membership based) | M | ✅ |
| Firestore **composite indexes** plan (`yearMonth, deletedAt, date`) | S | ⬜ (auto single-field indexes suffice so far; no committed `firestore.indexes.json`) |
| Admin SDK **loader** to import seed into Firestore | S | ✅ (`scripts/load_seed.mjs`) |
| Frontend scaffolding decisions (see below) | M | ✅ |
| "3-second entry" UX wireframe | M | ✅ |

**Frontend decisions to lock:** build tool (Vite vs Next.js), TypeScript (yes),
state/data layer (Firestore SDK + which offline strategy), UI approach (headless
+ own styles vs component lib), routing, PWA config, folder structure.

**Definition of done:** Firebase project exists, seed loads, and there's an
agreed UI + architecture spec to build Phase 1 against.

---

## Phase 1 — Core Expense Tracking (MVP)

**Goal:** the smallest version that replaces Notion for daily use. Record an
expense in **under 3 seconds**; see this month.

> Executable task breakdown: [phase-1-tasks.md](phase-1-tasks.md).

| Deliverable | Size | Status |
|-------------|------|--------|
| Google sign-in (Firebase Auth) | S | ✅ |
| Firestore integration + offline persistence | M | ✅ |
| **Quick-entry screen** — numpad-first, expense/income/transfer toggle, category icon grid, account selector, date defaults today, optional title/note | L | ✅ |
| Income & transfer entry (transfer: from/to account, no category) | M | ✅ |
| Recent/frequent categories surfaced first (Food is 62% of data) | S | ✅ |
| Transaction list — this month, grouped by day, running total | M | ✅ |
| Edit / soft-delete a transaction | S | ✅ |
| Category management (CRUD; seed the 14) | M | ✅ |
| Account management (CRUD; seed the 6 buckets) | M | ✅ |
| Import the 3-year seed so it's useful from day one | S | ✅ |
| PWA installable on phone (offline-capable) | M | ✅ |

**Phase 1 is complete and deployed live** at https://vault-39af9.web.app; user
is dogfooding daily on phone. (Bonus beyond scope: recurring transactions, an
Assets page with per-account balances + running-balance account detail.)

**Data model impact:** none — Phase 1 is exactly the current spec (`type`
already covers expense/income/transfer).

**Architecture note:** thread `ledgerId` through every read/write from day one —
do **not** hardcode a single ledger. Phase 2 (sharing) adds multiple ledgers;
building single-ledger-aware now avoids a rewrite. The MVP just shows one.

**Definition of done:** user records on their phone every day for a week and
stops opening Notion.

**Out of scope (deliberately):** budgets, charts, sharing, investments.

---

## Phase 2 — Shared Finance (per-ledger)

**Goal:** share a *part* of finances, not everything. ("Couple's" is already a
bucket — the need exists now.) Done early because sharing is foundational: it
touches how `ledgerId` is threaded everywhere.

**Model of sharing: a shared context = its own ledger** (not a per-account ACL
inside a personal ledger). So "Couple's" becomes a separate ledger both partners
are members of, while Personal/Dream/etc stay private. This keeps security rules
simple ("member of the ledger ⇒ can read/write it") and needs no per-account
permissions.

| Deliverable | Size | Status |
|-------------|------|--------|
| Multiple ledgers per user + ledger switcher (Personal / Couple's) | M | ✅ |
| Invite & join a ledger (invitation flow) | L | ✅ (Gmail invite / accept) |
| Roles: owner / member; security rules for multi-member read/write | L | ✅ (`firestore.rules`) |
| Per-transaction `createdBy` attribution shown in UI | S | ✅ (shown in shared ledgers via `memberProfiles`) |
| Real-time sync UX (two people editing) | M | ✅ (live via `onSnapshot`) |

**Phase 2 is complete** — sharing works end-to-end, and shared-ledger entries
show who created them.

**Data model impact:** `members` map already exists; add roles + an
`invitations` collection. No restructuring — this is why data lives under a
`ledger` from day one and why Phase 1 threads `ledgerId`.

**Migration note:** the Notion seed lands in one Personal ledger. Splitting the
"Couple's" account into a separate shared ledger later is a data move, not a
schema change.

**Trade-off / open:** a shared-as-separate-ledger design means no single list
mixing personal + shared accounts. A unified cross-ledger view is a later
nicety — confirm this is acceptable when designing Phase 2.

**Definition of done:** user + partner both record into a shared "Couple's"
ledger and see each other's entries live, while personal ledgers stay private.

---

## Phase 3 — Analytics, Budgeting & Reporting 🔜

**Goal:** understand spending and stay on budget. **← in progress.**

| Deliverable | Size | Status |
|-------------|------|--------|
| Monthly summary by category (sum `baseAmount`) | M | ✅ (Stats, from rollups) |
| Spending trend over time (month-over-month) | M | ✅ (trend line chart) |
| Charts — category breakdown + trend (follow dataviz conventions) | M | ⚠️ trend line done; category still bars (pie TBD) |
| **Budgets per account-bucket first** (envelope style), category budgets later | L | ⬜ (deferred — not a current pain; adds `budgets` collection, no migration) |
| Budget progress + overspend indicators | M | ⬜ |
| Filters & search (category, account, date range, title text) | M | ⬜ (partly covered by Stats; content-by-title view still TODO) |
| Data export (CSV / JSON) — delivers "own your data" for real | S | ✅ (Backup: JSON + CSV export/import) |

**Data model impact:** monthly **rollup docs** shipped
(`ledgers/{id}/rollups/{yearMonth}`, maintained on write — see DATA_MODEL) so
Stats/trends read a few small docs instead of every transaction. Budgets will
add a new `budgets` collection (keyed by account first), no migration.

**Definition of done:** can answer "did I overspend on the Food/General bucket
this month?" at a glance.

---

## Phase 4 — Asset & Investment Management

**Goal:** track net worth, not just cash flow — including US stocks.

| Deliverable | Size |
|-------------|------|
| Accounts carry balances (assets & liabilities), manual snapshots | M |
| **Buy lots**: record when / at what price / which stock / how many shares | M |
| Periodic **price + quantity snapshots** (user updates every ~2–3 months) | M |
| **Sells** with cost-basis handling (lot-based) | M |
| Returns: **growth-stock vs dividend-stock** calculations | M |
| Dividend income records | S |
| Foreign holdings valued via `baseAmount` / FX into TWD | M |
| Net worth over time | M |
| Price updates — manual first, market-data API later | M |

**Data model impact (Phase 4 only — no MVP impact):** new `holdings` /
`lots` / price-`snapshots` collections. A buy is two things: a **lot** (shares
at cost) *and* a normal **cash transaction** (the money out) — the existing
transaction model already handles the cash side. Quantities/prices reuse the
×100 rule (2 decimals; qty×price may not reconcile to the cent — accepted).
Detailed schema to be designed at Phase 4; captured here so it isn't lost.

**Definition of done:** see total net worth including US stocks, in TWD, with
per-holding return split into growth vs dividend.

---

## Phase 5 — AI-Powered Financial Assistant

**Goal:** natural-language insight over financial history. Built on the Claude API.

| Deliverable | Size |
|-------------|------|
| Auto-categorization suggestions on entry (learn title → category) | M |
| Natural-language queries ("how much on eating out last month?") | L |
| Prose monthly summaries & spending insights | M |
| Subscription / recurring / anomaly detection | M |

**Data model impact:** minimal; possibly a derived index for retrieval.

**Definition of done:** ask a question in plain language and get a correct,
grounded answer over your own data.

---

## Backlog (unscheduled)

Domain concepts defined in SPEC.md but not yet placed in a phase:

- **Attachments** (receipts, statements, images) — needs **Firebase Storage**
  (new dependency, cost, offline-sync complexity). Post-MVP; likely alongside
  or after Phase 3.
- **Tags** — lightweight optional classification beyond categories. Post-MVP.

---

## Cross-cutting (every phase)

- **Offline-first behavior** — entry must work with no signal, sync later. ✅
- **Backup / export** — never trap the data; export scheduled in Phase 3.
- **Security rules** — ledger-membership rules shipped with Phase 2
  (`firestore.rules`); tighten further as roles/features grow.
- **Testing** — at least the money math (×100, FX rounding) has unit tests. ✅

---

## Dependencies (build order)

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 (sharing) ──▶ Phase 3 (analytics)
                                                     └──▶ Phase 4 ──▶ Phase 5
```

Phase 1 unlocks everything. Sharing (Phase 2) is deliberately before analytics
(Phase 3) because it's foundational — it defines how `ledgerId` is threaded, so
doing it before building lots of analytics avoids rework.

---

## Recommended immediate next steps

Phase 1 (MVP) and Phase 2 (sharing) are shipped and in daily use. Next up is
**Phase 3 — analytics & budgeting**:

1. **Monthly summary by category** (sum `baseAmount`) — the first analytics view.
2. **Category-breakdown + trend charts** (follow the dataviz conventions).
3. **Budgets per account-bucket** (envelope style) + overspend indicators.
4. **Filters & search** (category / account / date range / title text).
5. **CSV / JSON export** — delivers "own your data" for real.

Small carry-over from Phase 2: show `createdBy` attribution in the transaction
UI (data already captured).

---

## Decisions made

1. ✅ **Income & transfer are in Phase 1** (not a fast-follow).
2. ✅ **Sharing is Phase 2, analytics/budgeting is Phase 3** — sharing is
   foundational (ledger threading), so it comes first.
3. ✅ **Budgets are per account-bucket first**, category budgets later.
4. ✅ **Sharing = separate ledger**, not per-account permissions.
5. ✅ **Investment tracking is Phase 4 only** — no impact on the MVP data model.

## Open questions (revisit at the relevant phase)

- **Phase 2:** is losing a unified personal+shared account list acceptable
  (since shared = separate ledger)?
- **Phase 4:** manual price entry only, or integrate a market-data API
  (adds a dependency/cost)?
