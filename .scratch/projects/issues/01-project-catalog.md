# 01 — Projects exist: create, extend, close, delete

**What to build:** The owner can keep a list of Projects. In Settings, alongside
the catalog, recurring rules, backup and ledger sections, a Projects section
where a Project is created with a name, a start date, and an end date that
cannot be omitted; extended when the episode runs long; marked as
auto-assigning; and deleted.

Whether a Project is in progress or has ended is read off its end date rather
than stored — a Category needs an archive flag because it has no end, a Project
has one. At most one Project in the Ledger may be auto-assigning at a time, so
that nothing later has to guess which of two overlapping Projects a purchase
belongs to.

No Financial Event references a Project yet. This ticket only makes Projects
exist.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [ ] A Project cannot be saved without an end date
- [ ] An end date can be extended at any time, including after it has passed
- [ ] A Project reads as in progress while today is on or before its end date and
      as ended afterwards, with no stored status field and no archive flag
- [ ] Turning auto-assign on for one Project turns it off for any other in the
      same write, so two can never both be on
- [ ] An ended Project cannot be auto-assigning
- [ ] Deleting a Project is a soft delete — it leaves the list but its record
      survives
- [ ] Projects belong to the Ledger, so both members of a shared Ledger see the
      same list
- [ ] All new interface strings go through i18n
- [ ] The persistence document describes the new collection
