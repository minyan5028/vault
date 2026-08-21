# Trade corrections — fixing what you recorded about a position

Status: ready-for-agent
Spec for [ADR-0010](../../docs/ADR/0010-trades-own-cost-basis.md) (Trades own
cost basis, snapshots own the position).

## Problem Statement

The owner tried to correct a holding's purchase date. The field exists, the edit
saved, and the trade log went on showing the old date — because the date is
stored twice, once on the Holding and once on its opening trade, and only one
copy moved. The edit looked broken.

Underneath that is a larger gap. A Trade cannot be edited or deleted at all. A
mis-typed share count, price, date or amount on a buy has exactly two escapes:
delete the entire holding and re-enter it, or write a one-off migration script.
Two such scripts already exist — `scripts/fix_opening_trades.mjs` corrected every
opening buy in the portfolio by hand, and `scripts/backfill_us_transfers.mjs`
patched their cash legs.

This directly contradicts ADR-0005, which promises that a correction edits the
event in place rather than posting a compensating entry. Trades are Financial
Events. They should behave like them.

The reason it was never fixed is a modelling problem, not a UI one. `shares` on
a Holding is written by two mechanisms that mean different things by it —
trades, which say what the owner bought, and snapshots, which say what the
broker reports — and because dividends are reinvested, the two are never equal.
`fix_opening_trades.mjs` had to prise them apart by hand and explain the
resulting discrepancy in a comment header.

## Solution

Name the two authorities and give each its own fields, per ADR-0010.

**Trades own cost basis.** `cost` and `realizedGain` become a fold over the trade
log, replayed in date order. Trades gain editing and soft delete. A trade's cash
leg is linked by `transferId` so both move together.

**Snapshots own the position.** `shares`, `price` and `pricedAt` stay an
observation of what the broker reports. A trade dated after the latest snapshot
adjusts `shares`; a trade dated before it does not, having been superseded.

**DRIP stays derived.** Reinvestment is share growth no trade accounts for. It
is not an event, gets no record, and `estimatedDividends` continues to compute it
exactly as it does today.

`Holding.buyDate` stops being independently editable and becomes a cache of the
earliest buy trade's date — so the edit the owner made, and expected to see,
finally takes effect where it belongs.

The holding's detail screen shows the gap explicitly:

```text
交易 15 股 · 持有 15.2506 股   +0.2506 來自再投資
```

Making the two-axis model visible is what stops it being rediscovered through a
bug, and it is the fastest way to spot a mis-typed snapshot.

## User Stories

1. As a Vault owner, I want to correct a trade's date, share count, price or
   amount, so that a typo does not force me to delete the whole holding.
2. As a Vault owner, I want to delete one bad trade without losing the position's
   other history, so that a duplicate entry is a one-tap fix.
3. As a Vault owner, I want a corrected trade's cash leg to move with it, so that
   my account balance never silently disagrees with my cost basis.
4. As a Vault owner, I want the purchase date I typed to be the date the trade
   log shows, so that one fact has one value.
5. As a Vault owner, I want to see how many shares I bought against how many I
   hold, so that reinvestment is visible rather than a discrepancy I have to
   explain to myself.
6. As a Vault owner, I want an edit that would make the history impossible to be
   refused with a reason, so that the app never invents money to accommodate me.

## Out of scope

Deliberate omissions, recorded so they are not read as oversights:

- **Re-pointing a trade's cash account.** Only date, shares, price and amount are
  editable. Changing which account paid means deleting the trade and re-entering
  it.
- **Editing a past snapshot** beyond today's behaviour, where re-entering the
  same date overwrites it.
- **Editing `shares`, `cost` or `price` on the Holding itself.** They move only
  through trades and snapshots. This is ADR-0010's central decision, not a
  missing feature.
- **Changing how `estimatedDividends` derives DRIP.** Its output will shift when
  a trade's share count is corrected; that is the correct consequence.
- **Stock splits.** Recorded as a known limitation in ADR-0010 — a split
  misreads as reinvestment on dividend-class holdings only, affects no asset
  figure, and will be revisited if it ever actually happens.
