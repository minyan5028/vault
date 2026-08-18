# 02 — A Financial Event can carry a Project

**What to build:** Quick Entry gains a Project control on expense, income and
transfer alike. The owner picks a Project or none, on a new entry or when
editing one recorded earlier — so a flight booked three months before the trip
can be attributed to it afterwards.

The monthly projections carry per-Project totals beside the existing per-Category
ones, so everyday spending is the total minus what the Projects account for.
Transfers may carry a Project for traceability but contribute to no total: buying
foreign cash and then spending it must not count twice.

When no Project exists, the control is absent and the entry screen is exactly
what it is today. This is a feature used a few times a year and it may not tax
the daily path.

Before adding the two new breakdown dimensions, generalise how a projection
contribution holds its breakdowns. Today each is a separately named field looped
over by hand in several places; a further dimension would mean hand-writing those
loops again, and the zero-check that decides whether a change is worth writing
would silently miss any dimension someone forgot to add. Make adding a dimension
data rather than code, and the omission becomes impossible rather than
test-guarded.

**Blocked by:** 01 — Projects exist.

**Status:** resolved

- [ ] An expense carrying a Project adds to that Project's expense total for the
      month
- [ ] An income carrying a Project adds to that Project's income total; a
      Project's headline figure is net of it
- [ ] A transfer carrying a Project adds to no total at all
- [ ] Attaching a Project to a Financial Event recorded earlier updates the
      monthly figures immediately and correctly
- [ ] **Detaching** a Project updates them too. The amount and Category are
      unchanged, so a change that moves no money must still be recognised as a
      change worth writing — the same failure that wiped the balance projection
      on 2026-08-01
- [ ] An edit that changes both Category and Project moves both breakdowns
- [ ] An edit that moves a Financial Event across a month boundary while carrying
      a Project splits correctly across the two months
- [ ] Rebuilding the projections from the Financial Events reproduces the same
      per-Project totals the incremental writes produced
- [ ] Everyday spending is derived by subtraction, so it can never disagree with
      the headline total
- [ ] With no Projects defined, the entry screen is unchanged
- [ ] Adding a further breakdown dimension later requires no new hand-written
      zero-check
- [ ] Existing projection tests pass unchanged
- [ ] The persistence document describes the new event field and the new
      projection fields
