# 06 — Selling more shares than the log accounts for

**Status:** needs-triage

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

- [ ] Decide between (a), (b) and (c) with the owner
- [ ] Whichever is chosen, record it as an amendment on ADR-0010 — the current
      text does not anticipate a sell exceeding the traded count
- [ ] If (b): the refusal from 03 needs a replacement guard, or an edit that
      strands a sell becomes silent again
