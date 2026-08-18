# Vault — domain language

The business domain and its ubiquitous language live in
[docs/SPEC.md](docs/SPEC.md): **Vault**, **Ledger**, **Timeline**, **Financial
Event**, **Money**, **Account**, **Category**, **Project**, **Projections**.
Decisions that shaped them are in [docs/ADR/](docs/ADR/).

This file names the concepts that emerged from the code afterwards — terms a
reader will meet in the source that `SPEC.md` does not define. Keep it short:
if a term belongs to the business domain, it belongs in `SPEC.md` instead.

## Ledger Endpoint

Anything a Financial Event can move money to or from: an **Account**, or a
**Holding**.

`Transaction.accountId` / `toAccountId` hold endpoint ids, not Account ids.
Most events name an Account on both sides, but a trade's cash leg is written as
a transfer whose far endpoint is the Holding itself, so a position's market
value never double-counts against the cash accounts on the Assets page.

Resolve an endpoint id through `src/lib/endpoints.ts` rather than searching the
account list — an account-only lookup renders a trade leg nameless.

## Ledger Effect

What one Financial Event does to the Ledger's **Projections** — the per-account
balance rollup and the per-month rollups.

Expressed as a value by `src/lib/ledgerEffect.ts`: `ledgerEffect(before, after)`
takes the event as it was and as it will be (either may be `null`) and returns
the already-pruned movement. Create, edit, delete, restore and each leg of a
holding teardown are all the same call with different arguments.

An **empty effect means write nothing**. Persisting a cancelled-out effect as an
empty map wipes the whole rollup — see `planEffect` for why Firestore treats it
that way.

## Write Plan

A description of what to write, as a plain value: an ordered list of document
operations with symbolic stand-ins for Firestore's write sentinels
(`src/data/writePlan.ts`).

The repos decide a plan (`src/data/writes.ts`, pure and tested); `firestoreExec`
commits it. That split is what makes the write path assertable without an
emulator — a plan can be compared with `toEqual`.
