# 05 — Projects survive export and backup

**What to build:** An export that cannot reconstruct the owner's own analysis is
not really an export. Financial history outlives the software holding it, so
everything this feature adds has to leave the building with the data.

The human-readable export gains a Project column, resolved to the Project's name
the way Category and Account already are, and empty on everyday rows. The full
backup includes the Projects themselves, so a restore brings back the list and
not just the references to it.

**Blocked by:** 02 — A Financial Event can carry a Project.

**Status:** resolved

- [ ] The human-readable export carries a Project column showing the name
- [ ] The column is empty for Financial Events with no Project
- [ ] The full backup includes the Projects, with their end dates intact
- [ ] Restoring a backup taken after this ticket reproduces both the Projects and
      the events' attribution to them

**Note from the review of 02:** the backup builder enumerates its collections by
hand, and its timestamp-field list carries `startDate` but not `endDate` — so
adding Projects means extending both, or restored Projects come back without the
one field that is mandatory. Until this ticket lands, exporting a Ledger and
importing it into a fresh one yields Financial Events pointing at Projects that
do not exist.
