# 03 — A trade can be corrected and deleted

**What to build:** The domain change. `planEditTrade` and `planDeleteTrade` join
`planBuy`/`planSell` on the plan/execute seam, and `cost`/`realizedGain` stop
being incrementally patched.

They become a fold: replay the holding's surviving trades in date order, buys
adding their amount to the basis, sells removing shares at the average cost *at
that moment* and banking the difference as realized gain. The replay divides by
**traded** shares, never held ones, so the event axis never depends on snapshot
data. Ties on the same date need a deterministic order — settle it and test it,
because average cost is path-dependent and a wobbly order makes the basis
non-reproducible.

Held shares follow the dated rule from ADR-0010: a trade dated **after** the
latest snapshot applies its share delta to `Holding.shares`, a trade dated
**before** it does not, having been superseded by an actual reading from the
broker. This is what makes correcting this morning's entry take effect while
correcting a two-year-old opening buy leaves the broker's count alone.

Deletion is soft, per ADR-0004 — a trade is a Financial Event and the code simply
never caught up. A soft-deleted trade drops out of the fold and takes its cash
leg with it, reversing that leg's projections through `ledgerEffect` the way
`planRemoveHolding` already does.

An edit can make history impossible: delete an early buy and a later sell may be
selling shares that were never bought. Refuse it, and name the trade that would
break — "this would leave −40 shares at the 3 Mar sell". Clamping at zero would
invent money.

**Blocked by:** 02 — a trade knows its cash leg.

**Status:** ready-for-agent

- [ ] Editing a trade's amount recomputes `cost` by replaying the whole log, not
      by applying a delta
- [ ] Editing a buy that precedes later sells re-prices every later sell's
      realized gain
- [ ] Editing a trade dated after the latest snapshot moves `Holding.shares` by
      the share delta
- [ ] Editing a trade dated before the latest snapshot leaves `Holding.shares`
      untouched
- [ ] Editing a trade's amount or date moves its linked cash leg in the same
      plan, and the account balance follows
- [ ] Editing a trade whose cash-leg link is unknown changes the trade only
- [ ] Deleting a trade sets `deletedAt` rather than removing the document
- [ ] A soft-deleted trade is excluded from the fold and its cash leg's effect on
      the projections is reversed exactly once
- [ ] An edit or deletion that would drive shares negative at any point in the
      replay is refused, naming the trade it would break
- [ ] Same-date trades replay in a deterministic order, asserted by test
- [ ] Replaying an untouched holding's log reproduces its current `cost` and
      `realizedGain` exactly — the fold agrees with what incremental writes built
- [ ] A holding whose opening buy was corrected by `fix_opening_trades.mjs`
      replays to the same cost it has today
