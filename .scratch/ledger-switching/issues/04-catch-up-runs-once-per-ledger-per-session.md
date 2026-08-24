# 04 — Switching no longer re-runs the recurring catch-up

**What to build:** The catch-up that materializes due recurring Financial Events
runs once per Ledger per session, not once per switch.

It is bound to the active Ledger today, so every switch re-runs it. Re-running is
safe — occurrences carry a deterministic id and the rule's next date is advanced
past today after the first run — so nothing is duplicated and no write happens on
a repeat. But each repeat still queries the Ledger's active rules, and switching
is about to become a habit rather than an event.

The stronger reason is truthfulness: the function documents itself as running on
app open, while it actually runs on every navigation. After this ticket that
sentence is true.

**Blocked by:** None — can start immediately, and can be verified today by
switching from the Timeline.

**Status:** resolved

- [x] Within one session, switching away from a Ledger and back does not re-run
      the catch-up for it
- [x] The first time a Ledger becomes active in a session, its due recurring
      events are still materialized
- [x] A due recurring event is still generated exactly once — no duplicates, and
      no change to the deterministic id or the advancing of the rule's next date
- [x] The comment describing when the catch-up runs matches what it now does
