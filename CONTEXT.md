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

## Trade

One buy or sell of a **Holding**, recorded by the owner as it happened, at
`ledgers/{id}/holdings/{hid}/trades/{tid}`.

Trades are the event axis of a position: `cost` and `realizedGain` are a fold
over the log, replayed in date order, never incrementally patched. A trade is
editable and soft-deletable like any other Financial Event — see
[ADR-0010](docs/ADR/0010-trades-own-cost-basis.md).

A trade may have a **cash leg**: the transfer that moved the money to or from a
cash account. The trade names it by `transferId`; the two are edited and deleted
together.

_Avoid_: transaction (that is a Financial Event), position (that is the Holding).

## Portfolio Snapshot

A dated reading of what the broker reports — every Holding's price and share
count on one date, plus the FX rates used to value them. Stored at
`ledgers/{id}/snapshots/{date}`.

Snapshots are the valuation axis: they own `shares`, `price` and `pricedAt`. A
snapshot supersedes every estimate before it, which is why a trade dated after
the latest snapshot adjusts `shares` and a trade dated before it does not.

_Avoid_: valuation, price update.

## Traded Shares · Held Shares

Two different quantities, kept apart deliberately.

**Traded shares** is the fold over the Trade log — what the owner bought. It
belongs to the event axis and is what the cost-basis replay divides by.

**Held shares** is `Holding.shares` — what the broker says is there, grown by
reinvestment. It belongs to the valuation axis and is what market value and the
displayed average cost use.

They are equal only for a holding that has never reinvested. A trade whose share
count differs from the holding's is not a discrepancy.

## DRIP

Dividends reinvested into more shares of the same Holding.

Derived, never stored: it is the share growth a Portfolio Snapshot reports that
no Trade accounts for (`estimatedDividends` in `src/lib/holdings.ts`). No money
enters the Ledger and no event is written, so DRIP has no record of its own —
only a figure computed on the Holding's detail screen.

_Avoid_: reinvestment trade, dividend event.
