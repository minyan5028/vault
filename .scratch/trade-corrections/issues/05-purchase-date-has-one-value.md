# 05 — The purchase date has one value

**What to build:** The bug that started this. `Holding.buyDate` stops being an
independently editable field and becomes a cache of the earliest buy trade's
date, recomputed on every trade write.

It stays a stored column rather than being derived on read: the investments list
shows it, and deriving it there would mean loading every holding's trades for a
label. Cached and never independently written is enough to make one fact have one
value.

`EditHoldingForm` loses the date input. Ticker, class, currency, target price and
the dividend figures stay — those are genuinely descriptive. The purchase date is
not; it belongs to the opening trade, and ticket 04 is where it gets corrected.

A backfill reconciles the existing drift. Where a holding's stored `buyDate`
disagrees with its opening trade, the stored date wins and is pushed onto the
trade — it is what the owner typed and intended, and the trade date is the stale
copy. Dry run first, listing every holding it would move.

**Blocked by:** 03 — a trade can be corrected and deleted.

**Status:** ready-for-agent

- [ ] `buyDate` is recomputed from the earliest surviving buy trade on every
      trade write — create, edit, delete and restore alike
- [ ] Deleting the earliest buy moves `buyDate` to the next surviving one
- [ ] A holding with no surviving buy trades has a null `buyDate`, and the screens
      that read it handle that
- [ ] The date input is gone from `EditHoldingForm`; the other descriptive fields
      are untouched
- [ ] Correcting the opening trade's date in the trade log updates the date shown
      on the holding and in the investments list
- [ ] The backfill pushes each stored `buyDate` onto its opening trade, listing
      every holding it moves in the dry run, and writes nothing without --commit
- [ ] Annualized yield-on-cost, which reads `buyDate`, is unchanged for holdings
      that had no drift
