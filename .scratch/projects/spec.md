# Projects — a second classification axis for Financial Events

Status: resolved
Spec for ADR-0009 (Projects as a second classification axis) and the ADR-0008
`sortOrder` amendment that ships with it.

## Problem Statement

A month containing a trip is not comparable to a month without one, and nothing
stored in the Ledger can tell them apart.

A six-day trip produces 外食, Travel, Fun, 日用品 and 治裝美容 rows that are
indistinguishable from everyday ones. The damage lands exactly on the figures
ADR-0008 worked to make actionable: "外食 is 10,514/mo" is a decision the owner
can act on, right up until a travel month inflates it, at which point the number
means nothing — and the difference cannot be recovered from any stored field.

The owner cannot currently answer either half of the question:

- "Was this a normal month, ignoring the trip?"
- "What did the Tokyo trip actually cost me?"

## Solution

A **Project** is a bounded, non-daily episode of spending that spans several
Categories — a trip, a wedding, a renovation. It is a second classification on a
Financial Event, independent of Category.

Category asks *what kind of money this is*. Project asks *which episode it
belonged to*. A Financial Event carries both, or carries only a Category.

The owner declares a Project once, in Settings, with a mandatory end date. While
one Project is set to auto-assign, every new manually recorded Financial Event is
stamped with it automatically and reversibly — so recording during a trip costs
no extra taps, and only declaring the trip costs anything at all.

Stats then shows the same total it always did, with the split beneath it:

```text
三月支出  60,880
  日常    42,180
  專案    18,700   東京
```

The total never shrinks. Vault records reality; hiding the trip by default would
make the owner systematically underestimate their own spending, which is the
inverse of the problem being solved.

## User Stories

1. As a Vault owner, I want to declare a Project before a trip, so that the
   spending it causes can be told apart from my everyday spending afterwards.
2. As a Vault owner, I want a Project to require an end date, so that a
   temporary episode cannot quietly become a permanent bucket that eats my
   daily baseline.
3. As a Vault owner, I want to extend a Project's end date when the episode runs
   long, so that a renovation that overruns does not have to be re-created.
4. As a Vault owner, I want a Project to cover several Categories at once, so
   that a trip's food, transport and shopping stay correctly categorized while
   still being attributable to the trip.
5. As a Vault owner recording an expense during a trip, I want the Project filled
   in automatically, so that recording stays as fast as it is on a normal day.
6. As a Vault owner recording an expense during a trip, I want to clear the
   Project on a single entry, so that a domestic bill paid while I am away is
   not counted against the trip.
7. As a Vault owner, I want recurring Financial Events (rent, insurance, telecom)
   to never be stamped with a Project, so that fixed obligations charged while I
   am abroad stay in my everyday spending where they belong.
8. As a Vault owner, I want to choose a Project when recording an income event,
   so that 禮金 received for a wedding offsets what the wedding cost.
9. As a Vault owner, I want to choose a Project when recording a transfer, so
   that buying foreign cash for a trip is traceable to it.
10. As a Vault owner, I want a Project's headline figure to be net of income and
    to exclude transfers, so that exchanging money and then spending it is not
    counted twice.
11. As a Vault owner, I want to attach a Project to a Financial Event I recorded
    earlier, so that a purchase made before the trip started — a flight booked
    three months ahead — counts against the trip it was for.
12. As a Vault owner, I want to detach a Project from a Financial Event, so that
    a mis-stamped entry can be corrected.
13. As a Vault owner, I want the monthly figures to update correctly the moment I
    attach or detach a Project, so that my Stats never silently show a stale
    number.
14. As a Vault owner, I want Stats to keep showing the true monthly total as its
    headline figure, so that I am never misled about what I actually spent.
15. As a Vault owner, I want Stats to show my everyday total separately beneath
    it, so that I can compare this month with months that had no Project.
16. As a Vault owner, I want to see each Project's total for the period, so that
    I know what a specific trip cost.
17. As a Vault owner, I want to drill into a Project and see it broken down by
    Category, so that I can tell committed cost (airfare, lodging) from
    compressible cost (eating out, shopping).
18. As a Vault owner, I want to drill from a Project into its individual
    Financial Events, so that I can check what a figure is made of.
19. As a Vault owner, I want the trend chart to show Project spending as a
    distinct band, so that a spike in a past month is explained rather than
    unexplained.
20. As a Vault owner, I want to switch the whole Stats view to everyday-only, so
    that I can study my baseline without Projects in the way — as a deliberate
    action, not a default.
21. As a Vault owner reviewing the Timeline, I want Financial Events belonging to
    a Project to be marked, so that an incorrect automatic stamp is visible
    rather than accumulating silently.
22. As a Vault owner reviewing the Timeline, I want Financial Events with no
    Project to look exactly as they do today, so that everyday review gains no
    visual clutter.
23. As a Vault owner, I want to create, rename and edit Projects in Settings, so
    that managing them stays off the daily recording path.
24. As a Vault owner, I want to create a Project from the recording screen too,
    so that realising at the airport that I forgot does not cost me a detour.
25. As a Vault owner, I want at most one Project auto-assigning at a time, so
    that the system never has to guess which of two overlapping Projects a
    purchase belongs to.
26. As a Vault owner starting a second Project while one is auto-assigning, I
    want to be asked which one should stamp, so that the switch is a decision I
    made rather than one made for me.
27. As a Vault owner, I want a Project to stop stamping once its end date has
    passed, so that forgetting to close it cannot contaminate later months.
28. As a Vault owner, I want an ended Project to remain visible and reviewable,
    so that I can look up what a trip cost years later.
29. As a Vault owner, I want to delete a Project created by mistake, so that the
    list stays meaningful.
30. As a Vault owner, I want deleting a Project to leave its Financial Events
    untouched, so that my financial history is never rewritten because I tidied
    a catalog.
31. As a Vault owner exporting my data, I want the Project on each row of the
    CSV, so that the export is enough to reconstruct my analysis outside Vault.
32. As a Vault owner backing up, I want Projects included in the JSON backup, so
    that a restore does not lose them.
33. As a member of a shared Ledger, I want to see the same active Project as the
    other member, so that a trip we take together is recorded once, consistently.
34. As a Vault owner, I want Project figures to come from the same rollups Stats
    already loads, so that the new view does not make the app slower or burn
    Firestore quota.
35. As a Vault owner, I want the everyday total to be derivable by subtraction,
    so that it can never disagree with the headline total.
36. As a Vault owner, I want Project names in my own words, so that "東京" and
    "妹妹婚禮" read the way I think about them.
37. As a Vault owner recording an expense while no Project is active, I want the
    entry screen to look exactly as it does today, so that the common path is
    not taxed by a feature I use a few times a year.

## Implementation Decisions

Grounded in ADR-0009 (*Projects as a second classification axis*), which records
the decision and the rejected alternatives.

### Domain

- **Project** is a business-domain concept, defined in `SPEC.md` alongside
  Account and Category — not an emergent code term.
- Two membership conditions, both required: **it has a definite end**, and **it
  spans multiple Categories**. Anything a single Category already expresses is
  not a Project (養車 fails both).
- A Project **holds no money**. It is not an Account, has no balance, and never
  enters net worth. This is the distinction that killed the "travel fund
  account" alternative: an Account answers *where the money is*, and paying a
  trip's ramen *from* the trip would destroy the record of which card was
  actually used.

### Persistence

- New subcollection `ledgers/{ledgerId}/projects/{projectId}`:
  `name`, `startDate`, `endDate` (mandatory), `autoAssign`, `deletedAt`,
  `createdAt`.
- Financial Events gain one nullable field, `projectId`. **Single-valued, not an
  array** — the exclusivity is what makes "everyday vs Project" a subtraction
  rather than a judgement call.
- Existing Financial Events are untouched; absent means `null`, which is the
  norm.
- `firestore.rules` needs **no change** — `match /{document=**}` under the
  Ledger already covers a new subcollection.
- Deletion is soft (ADR-0004) and **does not clear `projectId` on the events
  pointing at it**, matching how archiving a Category leaves history alone.

### Projections

- `rollups/{yearMonth}` gains `expenseByProject` and `incomeByProject`, mirroring
  the existing category maps.
- **Sparse — no sentinel key for "no Project".** `UNCATEGORIZED` exists because
  the category map is fanned out into a donut where every slice needs a key;
  these maps are an exception list holding zero to two entries in a typical
  month. The everyday baseline is a subtraction:
  `daily = expense − Σ expenseByProject`.
- Transfers contribute nothing, inheriting the rule the month rollups already
  apply — a transfer may carry a `projectId` for traceability, but never moves a
  total.
- A Project's headline figure is **net**: expenses minus income.

### Write path

- `projectId` joins the projection-relevant fields, so `ledgerEffect` handles
  create / edit / soft-delete / restore with no new call sites — the same
  before/after question it already answers.
- **`isZeroContribution` must also inspect the two Project maps.** An edit that
  only moves an event into or out of a Project changes neither amount nor
  Category, so the existing pruning would drop it as an empty effect and the
  rollup would silently keep the old figure. This is the same failure family as
  the empty-map write that wiped the balance rollup on 2026-08-01.
- The **at-most-one-auto-assigning-Project** invariant is enforced as a write
  decision: turning `autoAssign` on for one Project turns it off for the other
  **in the same Write Plan**, so the two can never both be on.
- `materializeRecurring` always writes `projectId: null`, unconditionally.

### Lifecycle

State is **derived, never stored**: in progress while `today ≤ endDate`, ended
after. There is no `status` field and no `archived` flag — a Category needs
`archived` because it has no end; a Project has one.

A Project stamps a new manual entry only when `autoAssign` is on **and** it has
not ended. `autoAssign` left on past the end date must not stamp.

### Presentation

- **Stats** gains a Project view alongside `category / trend / content`, reusing
  the existing view toggle and drill-down. Everything for the everyday/Project
  split and each Project's total comes from the 12 months of rollups Stats
  already loads — no extra reads. Only the per-Project Category cross-tab reads
  raw Financial Events on demand, bounded to tens of rows, the same pattern the
  by-title view already uses.
- The headline total is unchanged; the split renders beneath it. Everyday-only is
  a button, never a default.
- The trend chart stacks Project spend as a distinct band.
- **Quick Entry** gains a Project control on all three event types, prefilled
  from the auto-assigning Project and clearable. When no Project exists, the
  control is absent and the screen is byte-for-byte what it is today.
- **Settings** gains a Projects section beside catalog / recurring / backup /
  ledger, plus a create shortcut from the Quick Entry picker.
- **Timeline** marks Project rows quietly. Not decoration: automatic stamping
  makes mis-assignment invisible otherwise.
- All new UI strings go through i18n (ADR-0006).

### Export

- CSV gains a `Project` column, resolved to the name like Category and Account.
- The backup JSON gains a `projects` collection. Without both, an export can no
  longer reconstruct the owner's analysis, which *Data Outlives Software*
  forbids.

### Related change shipping alongside

ADR-0008 is amended: `sortOrder` no longer encodes the compressibility bands, it
encodes manual-entry frequency. No screen ever read the bands out of it, while
the band order put 固定義務 first — precisely the categories that arrive through
`materializeRecurring` and are never typed. Because Quick Entry preselects the
first category by `sortOrder`, every new expense opened preselected as 車輛 and
anything saved unchanged was silently misfiled.

## Testing Decisions

A good test here asserts **external behaviour** — the value a module returns for
a given input — and never how it got there. The write path is already built so
this is possible without an emulator: the repos decide a Write Plan (pure) and
`firestoreExec` commits it, so a plan can be compared with `toEqual`.

Four seams, three of them already exist. Prior art is cited for each.

**1. The Write Plan (primary seam, existing).** The highest pure point on the
write path; it imports no Firestore and transitively exercises the Ledger Effect
and the rollup math, so one assertion covers three layers. Prior art: the whole
of the existing Write Plan test file, especially the case asserting that an edit
moving no money writes only the field change (the 2026-08-01 rollup wipe). New
cases:

- an expense carrying a Project increments `expenseByProject`
- an income carrying a Project increments `incomeByProject`
- a **transfer** carrying a Project increments neither
- attaching a Project to an existing event nets the month correctly
- **detaching** a Project — the amount and Category are unchanged, so this is the
  regression test for the `isZeroContribution` trap; without the fix the plan
  contains no rollup write at all
- an edit that changes both Category and Project moves both maps
- crossing a month boundary while carrying a Project splits into two months
- enabling `autoAssign` on one Project disables it on the other in one plan

**2. Rollup math (existing seam).** Rebuild-from-scratch is a different entry
point than incremental writes and must agree with it. Prior art: the existing
rollup test file. New cases: rebuilt rollups carry both Project maps; the
everyday subtraction; transfers absent from both.

**3. CSV export (existing seam).** Prior art: the existing backup CSV test. New
case: the Project column resolves to the name, and is empty for everyday rows.

**4. Project derivation (the one new seam).** A small pure module answering
"which Project should stamp a new manual entry, given the Projects and today".
It exists as its own seam because of one subtle rule that belongs nowhere else:
a Project whose `autoAssign` is still on but whose `endDate` has passed **must
not stamp**. Cases: no Projects; one in progress and auto-assigning; one in
progress with auto-assign off; one auto-assigning but ended; boundary days at
each end of the range.

**Deliberately untested:** the React components. This repository has eleven test
files, all under `lib/` and `data/`, and no component test. This feature does not
justify opening that precedent — correctness lives in the pure seams above, and
the components only bind already-computed values.

## Out of Scope

- **A `budget` field and its burn-down.** It does not solve the stated problem,
  and adding it later needs no migration — one optional field on the Project
  document.
- **Backfilling history.** Trips predating this work stay mixed into everyday
  spending. Backfilling needs the owner to recall dates and belongs in a
  standalone script, dry-run by default, in the shape of the 2026-08 catalog
  migration. Cross-era comparisons stay contaminated until it is run.
- **Changes to the `Travel` Category.** With two axes it narrows cleanly to
  "transport and lodging themselves" and the Project says which trip. A separate
  lodging Category was considered and rejected: it never separates a decision.
- **Tags.** Still backlogged, still a good fit for genuinely orthogonal free-form
  marks (可報帳, 送禮), and unaffected by this.
- **Overlapping Projects on one Financial Event.** The field is single-valued by
  decision; "pick the more specific" is the rule.
- **Security rule changes.** None are needed.

## Further Notes

The naming carries a known bet. "Trip" was the concrete first choice, but a
wedding and a renovation have an identical shape, and renaming a Firestore field
across thousands of documents later is exactly the migration this project avoids.
Generic names invite the drift ADR-0008 was written about, and the membership
rule is the only thing holding that line. "Event" was unavailable: `SPEC.md`
already uses **Financial Event** for the transaction itself.

`Project` and `Projections` now sit adjacent in the glossary with the same root
and unrelated meanings. Judged acceptable — different words, and context
separates them — but worth knowing before someone "fixes" one of them.

Two axes will sometimes disagree, deliberately. A trip's airfare is 可選消費 by
band but is not compressible at all once booked. Neither axis is wrong;
compressibility describes the decision at the moment of committing, and the
Project says nothing about it.

Automatic stamping is what keeps the recording cost at zero, and it is also the
main new way to be wrong: a domestic order placed mid-trip gets stamped. The
Timeline marker is a mitigation, not a cure.
