# 03 — Auto-stamping during a Project, and seeing that it happened

**What to build:** While a Project is auto-assigning and has not ended, every new
manually recorded Financial Event arrives with that Project already filled in,
visibly and clearable on any single entry — a domestic bill paid while abroad
does not belong to the trip.

This is what keeps the recording cost at zero. Declaring a Project is the
uncommon path and may cost ten seconds; recording during one is the common path
and costs nothing extra. Hand-tagging forty entries would invert that.

Recurring Financial Events are never stamped. Rent, insurance and telecom keep
being charged while the owner is away, and none of it is trip spending.

Automatic stamping is also the main new way to be wrong, and a wrong stamp is
invisible in a list where every row looks the same. So the Timeline marks the
Financial Events that belong to a Project — quietly, and only those. Events with
no Project look exactly as they do today, so everyday review gains no clutter.

**Blocked by:** 02 — A Financial Event can carry a Project.

**Status:** resolved

- [ ] With an auto-assigning Project in progress, a new manual entry opens with it
      already selected
- [ ] The Project can be cleared on one entry without affecting the next
- [ ] A Project whose auto-assign is on but whose end date has passed stamps
      nothing
- [ ] A Project in progress with auto-assign off stamps nothing
- [ ] Financial Events generated from recurring rules are never stamped, whatever
      is auto-assigning
- [ ] Boundary days at each end of a Project's range behave as the owner would
      expect
- [ ] Timeline rows belonging to a Project carry a quiet marker
- [ ] Timeline rows with no Project are visually unchanged
- [ ] All new interface strings go through i18n
