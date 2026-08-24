# 02 — Every tab shows, and can change, the current Ledger

**What to build:** The owner can see which Ledger they are in, and switch to
another, from all four primary screens — Timeline, Stats, Assets and Settings.
The Ledger name takes the place of the page title in each header; page identity
is carried by the bottom tab bar, which already has an icon, a label and an
active colour for every destination.

Settings gains the most: it manages sharing, the catalog and Ledger deletion,
all scoped to the active Ledger, while today its header names only itself.

Switching keeps the owner on the screen they are on. Creating a Ledger still
takes them to the Timeline, because a new Ledger is empty and the Timeline is
where recording starts. Accepting an invitation no longer moves them, because
that Ledger already has a partner's events in it and there is no reason to throw
away what they were doing.

**Blocked by:** 01 — the shared header component and the Ledger context.

**Status:** resolved

- [x] Stats, Assets and Settings each render the same header as the Timeline, in
      the same position and at the same weight
- [x] The Ledger name replaces the page title on those three screens
- [x] Switching Ledger from any of the four screens leaves the owner on that
      same screen
- [x] Settings names the Ledger it is acting on, so the deletion action can be
      seen to target a specific Ledger
- [x] Creating a Ledger still switches to it and lands on the Timeline
- [x] Accepting an invitation switches to that Ledger and leaves the current
      screen unchanged
- [x] The invitation dot is visible from any of the four screens
- [x] Account Detail, Investments, Holding Detail and the Stats drill-down do
      NOT gain a switcher
- [x] The four page-title translation keys remain in use by the bottom tab bar;
      the i18n key-parity test still passes
