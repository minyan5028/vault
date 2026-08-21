# ADR-0010: Trades Own Cost Basis, Snapshots Own the Position

## Status

Accepted

## Context

A Holding carries `shares`, `cost`, `price` and `realizedGain`, and two
different mechanisms write them. Trades (`planBuy` / `planSell`) increment
`shares` and `cost`. Portfolio snapshots (`planSnapshot`) overwrite `shares` and
`price` outright from what the broker reports on that date.

Because dividends are reinvested, the broker's share count grows without any
trade behind it. `shares` therefore ends up meaning two different things at
once: how many shares the owner *bought*, and how many they *hold*. For a DRIP
holding these are never equal, and the codebase has already been forced to
prise them apart by hand — `scripts/fix_opening_trades.mjs` rewrote every
opening buy to the real original purchase (DIS: `15 × $88.00`) while leaving the
holding's DRIP-grown `15.2506` alone, then explained the discrepancy in a
comment header.

The conflation surfaced as a user-visible bug. `Holding.buyDate` duplicated the
opening trade's date; editing the holding's copy moved one and not the other, so
a corrected purchase date appeared not to save — the trade log went on showing
the old one.

ADR-0005 promises that a correction edits the event in place. Trades broke that
promise: they were append-only with no edit and no delete, and the only escape
from a mis-typed opening buy was deleting the entire holding or writing a
one-off migration script. Two such scripts now exist.

## Decision

A position has **two authorities**, and each owns different fields.

**Trades own the event axis.** `cost` and `realizedGain` are a fold over the
holding's trade log — never incrementally patched, always recomputed by
replaying buys and sells in date order. Trades become editable and
soft-deletable like any other Financial Event (ADR-0004, ADR-0005).

**Snapshots own the valuation axis.** `shares`, `price` and `pricedAt` are an
observation of what the broker reports. A snapshot supersedes every estimate
before it.

Between snapshots a trade still adjusts `shares`, because nothing else can. The
rule is dated: a trade **after** the latest snapshot applies its share delta to
`shares`; a trade **before** it does not, having already been superseded.

**DRIP is derived, never stored.** Reinvestment is the share growth a snapshot
reports that no trade accounts for — `estimatedDividends` already computes it
this way. It is not an event and gets no record of its own.

The cost-basis replay folds over **traded** shares only, so the event axis never
depends on observation data. `Holding.buyDate` becomes a cache of the earliest
buy trade's date, recomputed on every trade write and not independently
editable.

### Considered and rejected

**A `drip` trade kind**, with snapshots emitting an adjustment trade for
unexplained share growth. It would make `shares` a clean fold over one log, but
it invents events that never happened: no money moved and the owner did nothing.
It also duplicates a derivation `estimatedDividends` already performs correctly
from data it already has.

**Replaying cost basis against held shares** reconstructed from snapshot
history, which would reproduce exactly the average cost each past screen showed.
Rejected because it makes the event axis depend on the valuation axis, which is
the coupling this ADR exists to remove.

## Consequences

**Positive**

- A mis-typed trade is corrected in the app, in place, as ADR-0005 already
  promised — not by writing a migration script.
- Every number on a position traces to something: a trade the owner recorded, or
  a snapshot they took.
- A trade's share count may legitimately differ from the holding's. That is now
  the model rather than a discrepancy to apologise for.

**Negative**

- `shares`, `cost` and `price` are deliberately **not** editable on the Holding
  itself. Cost moves only through trades; shares and price only through
  snapshots. A future reader will read this as a missing feature; it is not.
- Average cost on screen (`cost ÷ held shares`) and the replay's basis (over
  traded shares) are two different, individually correct numbers. For a DRIP
  holding they diverge.
- Editing a past trade's share count changes the derived DRIP figure, so the
  estimated-dividend number moves when a trade is corrected. This is correct and
  will look alarming the first time.

**Known limitation — stock splits.** DRIP is inferred from share growth, so a
split is indistinguishable from a large reinvestment. A split does not affect
net worth (market value is `shares × price`, and the price falls by the same
factor), and it does not affect growth-class holdings at all, since
`estimatedDividends` runs only for `class === "dividend"`. When a **dividend**
holding splits, its estimated dividends and yield-on-cost become nonsense and
its user-entered `dividendPerShare` needs dividing by the split factor by hand.
Accepted rather than modelled: the affected figures are marked reference-only and
excluded from net worth, and the absurd number is its own warning. Revisit by
letting a snapshot record a split factor if this ever actually happens.

## Amendment: selling more than the log accounts for

The decision above left a position that had reinvested impossible to sell in
full. The log accounts for the 15 DIS shares that were bought; the broker
reports 15.2506; and a fold that refuses to sell shares no trade bought refuses
the sale. Before this ADR the increment simply let it through, so the model as
first written was a regression on a path every reinvesting holding eventually
takes.

**A sale is permitted up to whichever is larger of what the log accounts for on
its date and what the broker says is held, and its cost is apportioned against
that same figure.**

Both halves matter. Permitting the sale without changing the denominator looked
right only because a full exit divides by itself: selling 20 of a position of 30
that the log records as 10 would have removed the entire basis and left the
remaining 10 shares apparently free. The number that decides whether a sale is
allowed has to be the number its cost is divided by.

The larger of the two, because they differ in both directions. Reinvestment puts
the broker ahead. A buy recorded before the next snapshot puts the log ahead, and
deferring to the broker there would price the sale as if the new shares did not
exist.

**The figure is frozen onto the sell as `basisShares`.** It comes from the
snapshots, and snapshots keep moving; recomputing it on each replay would make
historical realized gains drift every time an unrelated trade was corrected. Held
shares therefore influence the arithmetic once, at the moment the sale happens,
and the fold remains a function of the trade log alone — which is what the main
decision requires. This is the device [ADR-0002](0002-fx-locked-at-entry.md)
already uses: the observation is locked into the event at entry rather than
looked up again later.

Sells recorded before this existed carry no `basisShares` and fall back to the
traded count, which is what they were computed with, so no stored figure moves.

The refusal survives in weakened form: a sale beyond *both* counts is still
refused by name. An edit that strands an earlier sell is caught whenever the
stranded quantity exceeds the held count too — and when it does not, the
traded-versus-held line on the detail screen is where it shows.

## Rationale

Cost basis is history: what the owner paid, recorded once, corrigible when
mis-typed. Share count is an observation: what the broker says is there today.
Storing both in one field meant every correction had to choose which meaning to
honour, and the app kept choosing wrong. Naming the two authorities makes each
field's provenance a property of the model instead of a thing rediscovered
through a bug.
