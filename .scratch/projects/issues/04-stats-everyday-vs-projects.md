# 04 — Stats: everyday spending separated from Projects, and reviewing one

**What to build:** The half of the feature the owner actually asked for.

The headline monthly figure stays the true total — it never shrinks. Beneath it,
the same total split into everyday and Project spending, so a month containing a
trip becomes comparable to a month without one and every per-Category figure is
readable again. The trend chart stacks Project spending as its own band, so a
past spike is explained rather than merely visible.

An everyday-only view exists, but as a deliberate toggle. Defaulting to it would
make the owner systematically underestimate their own spending, which is the
inverse of the problem being solved.

Then, reviewing a single Project: what a trip cost, broken down by Category — so
committed cost (transport, lodging) can be told from compressible cost (eating
out, shopping) — and drillable down to the individual Financial Events behind any
figure.

Everything for the split and for each Project's total comes from the monthly
projections the screen already loads. Only the per-Project Category breakdown
reads raw Financial Events, on demand, bounded to one Project's worth.

**Blocked by:** 02 — A Financial Event can carry a Project.

**Status:** resolved

- [ ] The headline monthly total is unchanged by this feature
- [ ] Everyday and Project figures are shown beneath it and sum to that total
- [ ] The trend chart shows Project spending as a distinct band across the
      visible months
- [ ] Everyday-only is reachable in one action and is never the default
- [ ] Each Project's net figure for the selected period is listed
- [ ] A Project drills into a Category breakdown, and a Category within it drills
      into the Financial Events behind it
- [ ] Both a single month and a whole year work as the selected period
- [ ] The split and the per-Project totals require no reads beyond the monthly
      projections already loaded
- [ ] An ended Project stays visible and reviewable
- [ ] All new interface strings go through i18n
