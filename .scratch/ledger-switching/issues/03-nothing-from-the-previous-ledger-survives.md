# 03 — Switching leaves nothing from the previous Ledger on screen

**What to build:** At the moment the Ledger changes, nothing on screen belongs
to the Ledger just left. Not a number, not a name, not a filter.

Two faults produce the same symptom today, and both are fixed here.

**The data.** The catalog hook does not clear when the Ledger changes, so the
previous Ledger's Accounts, Categories and Projects stay on screen during the
round trip. On Assets this is at its worst: the previous Ledger's account names
render next to a balance rollup that has already blanked, producing
plausible-looking totals that are true of no Ledger at all. The hook adopts the
shared live-query helper, which already guarantees a reset to empty the moment
the key changes. Adopting it also removes the hook's one-shot server fetch —
that fetch is both a duplicate read and a forced round trip, while a subscription
over the persistent local cache serves what the device already has. Returning to
a Ledger looked at moments ago should therefore be instant and cost nothing.

**The screen state.** State holding an identifier from one Ledger must not
outlive the switch: the Stats drill-down, the open Project, the selected Holding,
and the open Settings sub-page — including the one that deletes a Ledger. State
that means the same thing in any Ledger survives: the month, the period, the
view, the income/expense mode. Reading the same month in both Ledgers is the
comparison this whole feature exists to make cheap, so re-mounting the screen is
not the answer.

A brief blank is the correct behaviour, and is preferred to showing the previous
Ledger's data.

**Blocked by:** 02 — the residue is only observable once Stats, Assets and
Settings can switch.

**Status:** resolved

- [x] Switching Ledger on Assets never shows the previous Ledger's account names
- [x] Switching Ledger clears Accounts, Categories and Projects before the new
      Ledger's arrive, rather than holding the old ones
- [x] Returning to a Ledger visited earlier in the session paints from the local
      cache without waiting on the server
- [x] A Stats drill-down open at the moment of the switch closes
- [x] An open Project view closes on switch
- [x] A selected Holding clears on switch
- [x] An open Settings sub-page closes on switch, so a destructive action cannot
      change target underneath the owner
- [x] The undo toast is withdrawn on switch — it does not cover the header, so
      without this the offer stays tappable and restores against the wrong
      Ledger, silently succeeding and losing the deletion (found in review)
- [x] The month, period, view and income/expense mode survive the switch
- [x] The month-transactions hook is left untouched — its one-shot fetch stays
