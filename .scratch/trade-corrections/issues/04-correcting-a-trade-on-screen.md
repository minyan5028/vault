# 04 — Correcting a trade, and seeing what you hold

**What to build:** Two changes to the holding's detail screen.

Trade log rows become tappable, expanding an edit form in place — the same
affordance `EditHoldingForm` already uses, so nothing new has to be learned. Date,
shares, price and amount are editable; the cash account is not. A refused edit
shows the reason it was refused, naming the trade that would break, rather than a
generic failure.

Second, the screen states the two share counts side by side:

```text
交易 15 股 · 持有 15.2506 股   +0.2506 來自再投資
```

`HoldingDetail` already subscribes to the trades and receives the snapshots, so
this costs no extra Firestore reads. It is what makes the two-axis model
something the owner can see rather than something they deduce from a bug, and a
mis-typed snapshot shows up here first.

The line only earns its place when the two differ — for a holding that has never
reinvested it is noise.

**Blocked by:** 03 — a trade can be corrected and deleted.

**Status:** ready-for-agent

- [ ] Tapping a trade row expands an edit form in place; tapping again collapses
      it
- [ ] Date, shares, price and amount are editable; the cash account is not
      offered
- [ ] Saving a correction updates the trade log, the cost basis and the gain
      figures without leaving the screen
- [ ] A refused edit explains why, naming the trade that would break
- [ ] Deleting a trade asks for confirmation, matching the existing delete
      affordance
- [ ] Traded and held shares are shown together, with the reinvested difference,
      whenever they differ
- [ ] The line is absent when they are equal
- [ ] Both strings exist in `en` and `zh-TW`
- [ ] No additional Firestore subscription is opened
