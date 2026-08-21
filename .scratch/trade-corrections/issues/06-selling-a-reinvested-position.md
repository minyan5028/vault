# 06 — Selling more shares than the log accounts for

**Status:** resolved

**Found while building 03/04.** Not in the original spec, and it is a real
functional gap that ADR-0010 creates.

Under ADR-0010 the cost-basis fold replays **traded** shares — what a buy or
sell put in the log. DRIP shares are not in the log, by design: reinvestment is
derived from snapshots and is not an event. So for DIS the log accounts for 15
shares while the broker reports 15.2506.

Selling the whole position means recording a sell of 15.2506 shares, and the
fold refuses it: the log cannot support selling shares no trade ever bought.
Before this feature `planSell` simply incremented and the write went through, so
this is a regression on a path the owner will eventually take — every reinvesting
holding hits it the day it is sold in full.

For now the refusal stands and says what to do: the sell form checks against the
traded count and tells the owner to record the reinvested shares as a buy first.
That is honest and invents no money, but it is a chore that arrives at exactly
the wrong moment.

**The decision to make**, since each answer changes ADR-0010:

- **(a) Record the reinvestment.** The owner adds a buy for the reinvested
  shares before selling. No model change; the cost of "DRIP is not a trade",
  paid at sale time.
- **(b) Zero-cost excess.** The fold allows a sell beyond traded shares,
  removing all remaining basis and banking the rest as realized gain. Stays
  self-contained — no snapshot data enters the fold — and is consistent with
  `dividendReceived` never being added to cost. But it weakens the refusal from
  03: deleting an early buy would then quietly succeed instead of being caught.
- **(c) Fold against held shares.** Faithful to what the broker reports, but it
  makes the event axis depend on the valuation axis, which is the coupling
  ADR-0010 exists to remove.

## Answer

None of the three. The owner proposed a fourth: check the sale against **both**
counts and allow it if it satisfies either. That is better than all of (a), (b)
and (c), and working it through produced the rule that shipped.

The first attempt was to permit the sale on `max(traded, held)` while still
dividing the cost by the traded count. The owner found the case that breaks it:
bought 10, snapshot says 30, sell 20. Dividing by the traded count removes the
*entire* basis for a sale of two thirds of the position, leaving the remaining
10 shares apparently free. The full-exit case had looked right only because
dividing by itself gives 100% either way.

So both halves move together: **the number that decides whether a sale is
allowed is the number its cost is divided by.** Larger of the two, because they
differ in both directions — reinvestment puts the broker ahead, a buy not yet
snapshotted puts the log ahead.

That figure is then **frozen onto the sell** as `basisShares`, rather than
recomputed on each replay, or historical realized gains would drift every time an
unrelated trade was corrected. Held shares influence the arithmetic once, at the
moment of sale, and the fold stays a function of the log alone — the same device
ADR-0002 uses for FX.

- [x] Decided with the owner: permit and apportion against `max(traded, held)`
- [x] Recorded as an amendment on ADR-0010, cross-referencing ADR-0002
- [x] The refusal survives: a sale beyond *both* counts is still refused by name
