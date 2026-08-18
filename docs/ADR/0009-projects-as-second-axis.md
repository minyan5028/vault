# ADR-0009: Projects as a second classification axis

## Status

Accepted.

## Context

ADR-0008 settled what expense categories are *for*: they are organized by
compressibility — how much discretion the owner has over the money. That axis
answers one question well, "where did I overspend?", and it answers it with one
number per band.

It cannot answer a second question the owner also asks: **was this a normal
month?**

A six-day trip to Tokyo produces 外食, Travel, Fun, 日用品 and 治裝美容 rows. It
cuts across all three bands, because a trip is not a *kind* of money — it is a
bounded episode of life. The consequence is that a month containing a trip is
not comparable to a month without one, and the damage lands precisely on the
figures ADR-0008 worked to make actionable: "外食 is 10,514/mo" is a decision
the owner can make, right up until the month a trip inflates it, at which point
the number means nothing and **no stored field can recover the difference**.

Two obvious repairs were considered first, and both fail for reasons already
established:

- **File the whole trip under `Travel`.** This destroys the band information.
  The owner learns "Travel 68,432" but not that 31,200 of it was airfare —
  committed months ago, uncompressible — and 12,400 was shopping, entirely
  compressible. This is the same objection ADR-0008 raised against collapsing
  to a three-category table: it discards actionable detail.
- **Leave it spread across the daily categories.** That is the current state,
  and it is the problem.

The question underneath both failures: a Financial Event carries **two
independent classifications** — what kind of money it is, and which episode of
life it belongs to. One field cannot hold both, and forcing it to is how
ADR-0008's catalog drifted in the first place.

## Decision

**A Project is a second, orthogonal classification axis: a bounded, non-daily
episode of spending that spans multiple categories.**

Categories keep answering *what kind of money*. Projects answer *which episode*.
Neither overrides the other; a transaction carries both.

### Membership

Two conditions, both required:

1. **It has a definite end.** `endDate` is mandatory. It may be extended as many
   times as needed, but it can never be omitted.
2. **It spans multiple categories.** Anything a single category already
   expresses is not a Project.

The first condition is doing the real work. The failure mode of a container
like this is that it silently becomes permanent — 養車, 健身, 小孩 — at which
point it stops being an exception and starts eating the daily baseline it was
built to protect. A mandatory end date does not forbid that; it makes the owner
re-authorize it by hand, every time. Friction, not prohibition.

The second condition keeps Projects from competing with categories. 養車 fails
both tests: it never ends, and 車輛 already expresses it.

### Storage

```text
ledgers/{ledgerId}/projects/{projectId}
```

| Field      | Type              | Description                                     |
| ---------- | ----------------- | ----------------------------------------------- |
| name       | string            | User-defined                                    |
| startDate  | timestamp         | Display, and the range a backfill would use     |
| endDate    | timestamp         | **Mandatory.** Extendable, never absent         |
| autoAssign | boolean           | Stamp new manual entries with this project      |
| deletedAt  | timestamp \| null | Soft delete (ADR-0004)                          |
| createdAt  | timestamp         | Server timestamp                                |

`transactions/{id}` gains one field:

| Field     | Type            | Description                          |
| --------- | --------------- | ------------------------------------ |
| projectId | string \| null  | Null for everyday spending — the norm |

Single-valued, not an array. A trip's money is not also daily money; the
exclusivity is real, and it is what makes "daily vs project" a split rather
than a judgement call.

### Semantics

**A project's figure is net: expenses minus income. Transfers are excluded.**

A wedding that takes NT$200,000 in 禮金 and spends NT$350,000 cost NT$150,000,
not NT$350,000. Transfers are excluded for the same reason the month rollups
already exclude them: exchanging NT$20,000 into yen is a transfer, and spending
that cash is an expense — counting both doubles the trip.

A transfer *may* carry a `projectId` for traceability, and the project view may
show it, but it never contributes to any total. The rule already exists in
`lib/rollup.ts` (`monthContribution` returns `null` for transfers); Projects
inherit it rather than restating it.

### Lifecycle

State is **derived, never stored**:

- **In progress** — today ≤ `endDate`
- **Ended** — today > `endDate`

There is no `status` field and no `archived` flag. Categories need `archived`
because they have no end; Projects have one, so "ended" already does the work of
putting them away.

An ended project keeps `autoAssign` off by definition — only an in-progress
project can stamp — and **at most one project ledger-wide may have `autoAssign`
on**. Starting a second asks the owner to switch. With a single-valued
`projectId`, two auto-stamping projects would make the system guess, and a wrong
guess here is silent.

Deleting a project is a soft delete, and **transactions keep pointing at it**.
The projections keep their key. History is not rewritten because the catalog
changed — the same rule that governs archiving a category.

### Automatic assignment

While a project has `autoAssign` on and today falls within its range, new
**manual** entries are stamped with its id, visibly and reversibly per entry.

`materializeRecurring` always writes `projectId: null`. Rent, insurance and
telecom keep being charged while the owner is in Tokyo, and none of it is trip
spending. ADR-0008 recorded that `materializeRecurring` stamps no back-reference
onto the rows it generates as a limitation; here it is exactly the behaviour
required.

This is what keeps the recording cost at zero. Declaring a project is the
uncommon path and may cost ten seconds; recording during one is the common path
and costs nothing extra. Hand-tagging forty transactions would invert that.

### Projections

`rollups/{yearMonth}` gains two maps, mirroring the category maps:

| Field             | Type | Description                          |
| ----------------- | ---- | ------------------------------------ |
| expenseByProject  | map  | projectId → minor units              |
| incomeByProject   | map  | projectId → minor units              |

**Sparse — no sentinel key for "no project".** `UNCATEGORIZED` exists because
`expenseByCategory` is fanned out into a donut where every slice needs a key.
These maps are not that; they are an exception list, typically holding zero to
two entries a month. The daily baseline is a subtraction:

```text
daily expense = expense − Σ expenseByProject
```

Everything the Stats screen needs for the daily/project split, and for each
project's total, therefore comes from rollups already loaded — no extra reads.
Only a cross-tab ("外食 was 41% of the Tokyo trip") reads that project's raw
transactions, on demand, bounded to tens of rows — the same pattern the by-title
view already uses.

### Presentation

**The headline number stays the total.** The split is shown beneath it:

```text
三月支出  60,880
  日常    42,180
  專案    18,700   東京
```

Never a default filter. Vault records reality (PHILOSOPHY, *Reality First*); a
default that hides the trip would make the owner systematically underestimate
their own spending — the exact inverse of the problem this ADR exists to solve.
"Daily only" is a button the owner presses, not a state they wake up in.

The trend chart stacks project spend as a distinct band, so a spike is
*explained* rather than flattened. The Timeline marks project rows quietly —
not for decoration, but because `autoAssign` is automatic and a mis-stamp is
otherwise invisible.

## Consequences

**Positive**

- The daily baseline becomes comparable across months again. Every per-category
  figure ADR-0008 made actionable survives a travel month intact.
- A project becomes a reviewable object: "Tokyo, 6 days, 68,432 — 46% transport
  and lodging, 28% eating out". That analysis was not previously computable.
- The two axes multiply instead of competing. Compressibility can be asked
  *within* a project, which is where the airfare/shopping distinction lives.
- Multi-currency lands for free. `baseAmount` is locked at entry (ADR-0002), so
  a trip's total in TWD is already deterministic, and the yen-buying transfer is
  already excluded from expense totals.
- Shared ledgers get it at no cost: the project doc lives under the ledger, so
  both members see the same active project.
- `firestore.rules` needs no change — `match /{document=**}` under the ledger
  already covers a new subcollection.

**Negative**

- **A second axis is a second thing to get wrong**, and `autoAssign` makes the
  mistakes silent: a domestic online order placed during a trip is stamped
  Tokyo. The Timeline marker is the mitigation, not a cure.
- **Overlap forces a choice.** A renovation running three months with a trip
  inside it satisfies both; a single-valued field admits one. The rule is "pick
  the more specific", and it is a real cost of choosing exclusivity.
- `projectId` threads through every write path — `ledgerEffect`, the write
  plans, backup JSON, the CSV export. Small individually, not free in total.
- **The two axes can disagree, deliberately.** A trip's airfare is 可選消費 by
  band, but once booked it is not compressible at all. Neither axis is wrong;
  compressibility describes the decision *at the moment of committing*, and the
  project says nothing about it.
- History predating this ADR still has trips mixed into daily spending. Nothing
  is backfilled, so cross-era comparisons stay contaminated until someone runs
  the backfill.
- The naming carries a bet: "Project" is generic enough to hold a wedding or a
  renovation, which is why it was chosen over "Trip", but generic names invite
  exactly the drift ADR-0008 was written about. The membership rule is the only
  thing holding the line.

## Rationale

The alternatives were rejected on mechanics, not taste.

**A dedicated Account (a travel fund)** was the closest miss, because a Project
*feels* account-shaped — a container with a total that eventually closes. It
fails on one concrete point: an Account answers "where is the money", and its
balance is real, summing into net worth. A Project holds no money. Making the
trip an account means the ramen is paid *from* the trip rather than from the
Cathay card, which destroys the record of how it was actually paid — and that
record is reality, while the project is an interpretation laid on top of it.
Reality may not be displaced by interpretation.

**A multi-valued tag** (already in SPEC.md, backlogged) was rejected because the
daily/project split would stop being a subtraction and start being a judgement:
with three tags on a row, which total owns it? Tags remain a good fit for
genuinely orthogonal free-form marks (可報帳, 送禮) and can still be added later
without disturbing this.

**A ledger per trip** violates *Grow Without Migration* and fragments net worth.

**A boolean `isTravel`** answers "how much did travel cost" but not "how much did
*Tokyo* cost". The point is that an episode is a nameable object, not a property.

**Inferring trips** from foreign currency or a date range costs no schema, but
fails on domestic trips paid in TWD — and Vault records reality, not guesses.

**Naming.** "Trip" was the first choice and is the concrete one, but a wedding, a
renovation and a hospitalization have the identical shape, and renaming a
Firestore field across thousands of documents later is precisely the migration
this project avoids. "Event" was unavailable: SPEC.md already uses **Financial
Event** for the transaction itself.

## Notes

Ships alongside an **amendment to ADR-0008**: `sortOrder` no longer encodes the
three bands. No screen ever read the bands out of it — Stats sorts by amount and
uses categories only as a name lookup — while the band order put 固定義務 first,
which is exactly the set that arrives through `materializeRecurring` and never
passes through Quick Entry. Because Quick Entry preselects the first category by
`sortOrder`, every new expense opened preselected as 車輛. `sortOrder` now
encodes manual-entry frequency, its only real consumer; the bands live in
ADR-0008 alone.

The `Travel` category is unchanged. With two axes it narrows cleanly to
"transport and lodging themselves", and the project says which trip. A separate
lodging category was considered and rejected — it never separates a decision.

**Implementation trap.** `isZeroContribution` in `lib/ledgerEffect.ts` currently
inspects income, expense and the two category maps. It must also inspect the two
project maps. An edit that only moves a transaction into or out of a project
changes neither amount nor category, so `pruneZeroContributions` would drop it
as an empty effect and the rollup would silently keep the old figure — the same
family as the empty-map write that wiped the balance rollup on 2026-08-01.

Explicitly out of scope: the `budget` field and its burn-down (a later optional
field on the project doc, no migration required); the historical backfill, which
needs the owner to recall dates and belongs in a standalone dry-run-by-default
script in the shape of `migrate_catalog_2026_08.mjs`.

### Open questions

- **Overlap has a rule but no evidence.** "Pick the more specific" is untested
  against real overlapping projects; if it turns out to be decided wrongly and
  often, the exclusivity assumption is what has to give.
- **A deleted project keeps its key in the rollups**, so a rebuild from
  transactions reproduces it and the totals stay honest. Whether the project
  view should surface those orphan keys, or quietly fold them into daily, is
  undecided.
