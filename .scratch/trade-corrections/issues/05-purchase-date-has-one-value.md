# 05 — The purchase date has one value

**What to build:** The bug that started this. `Holding.buyDate` stops being an
independently editable field and becomes a cache of the earliest buy trade's
date, recomputed on every trade write.

It stays a stored column rather than being derived on read. The reason given
when this was decided — that the investments list shows it, so deriving would
mean loading every holding's trades for a label — turned out to be wrong: the
list never displayed it, only the detail screen does. The column stays anyway,
for a smaller reason: `AddHoldingForm` writes it and the detail screen reads it,
so keeping it costs nothing and removing it is churn with no gain. Cached and
never independently written is what makes one fact have one value.

`EditHoldingForm` loses the date input. Ticker, class, currency, target price and
the dividend figures stay — those are genuinely descriptive. The purchase date is
not; it belongs to the opening trade, and ticket 04 is where it gets corrected.

A backfill reconciles the existing drift. Where a holding's stored `buyDate`
disagrees with its opening trade, the stored date wins and is pushed onto the
trade — it is what the owner typed and intended, and the trade date is the stale
copy. Dry run first, listing every holding it would move.

**Blocked by:** 03 — a trade can be corrected and deleted.

**Status:** resolved

- [x] `buyDate` is recomputed from the earliest surviving buy trade on every
      trade write — create, edit and delete. There is no restore: nothing offers
      one, and an unreachable code path is worse than a missing one
- [x] Deleting the earliest buy moves `buyDate` to the next surviving one
- [x] A holding with no surviving buy trades has a null `buyDate`, and the screens
      that read it handle that
- [x] The date input is gone from `EditHoldingForm`; the other descriptive fields
      are untouched
- [x] Correcting the opening trade's date in the trade log updates the date shown
      on the holding. Not the investments list — it never showed the date
- [x] The backfill pushes each stored `buyDate` onto its opening trade, listing
      every holding it moves in the dry run, and writes nothing without --commit
- [x] Annualized yield-on-cost, which reads `buyDate`, is unchanged for holdings
      that had no drift
