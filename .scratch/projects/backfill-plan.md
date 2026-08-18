# Backfilling historical trips into Projects

Status: decided; awaiting execution (blocked on the ledger's daily Firestore
read quota, which resets at midnight US Pacific)

ADR-0009 left this out of scope deliberately: it needs the owner to recall
dates, so it is one-off human work rather than a rule. This file is the result
of that recall. It is written down rather than left in a conversation for the
reason ADR-0008 exists — the previous migration's reasoning survived only in a
commit message, and a later review re-derived it from scratch and reported
already-settled questions as new ones.

Executed by `scripts/backfill_trip_projects.mjs`, dry-run by default.

## The four trips, as decided

| Project | Project dates | Rows | Net |
|---|---|---|---|
| 日本富士東京之旅 | 2026-07-26 → 08-02 | 83 | **48,660** |
| 日本熊本福岡之旅 | 2025-12-29 → 2026-01-06 | 90 | **133,030** |
| 日本京阪神之旅 | 2024-12-28 → 2025-01-01 | 25 | **47,526** |
| 韓國首爾之旅 | 2023-12-02 → 12-09 (+ title match) | 15 | **23,639** |

Tokyo's net is 59,160 of expense less 10,500 of trip income; the rest carry no
income. Figures are from the last complete dry-run and are re-asserted on the
next run before anything is written.

## Dates are never changed

The owner initially proposed moving the out-of-range Seoul rows onto the trip's
boundary dates. This was measured and rejected: it would have shifted NT$25,018
out of 2023-11 and 2024-01 into 2023-12, cutting November's recorded spending by
46% and inflating December's by 38% — three months of history describing
something that did not happen, plus a `yearMonth` rewrite and a rollup rebuild
as extra moving parts.

It is also unnecessary. A Project is a grouping and its dates are only the
auto-assign heuristic (ADR-0009); membership is independent of when a purchase
happened, which is exactly how a flight booked months ahead attaches to the trip
it is for. **Only `projectId` is written.**

## What is excluded, and on what evidence

**Recurring-rule output — evidence, not guesswork.** `materializeRecurring`
copies the rule's `title` onto the transaction it generates and leaves no
back-reference (a limitation ADR-0008 recorded), so a title matching one of the
14 rules in the `recurring` collection identifies rent, insurance and telecom
charged while the owner was away: 房租, 勞保費, 健保費, 匯給媽, 約會基金,
慧通 (salary), 中華電信手機費/網路費.

**Transfers — all of them.** 薪資撥款→Fixed/Dream/Savings/Investment, 攤銷
(147,000 / 100,000 / 36,900 / 14,032), 美股投資 80,000, Mac 2,000. None is money
moved *for* a trip, and a transfer contributes to no total anyway (ADR-0009), so
attaching one would buy traceability only.

**Income, except where named below.** 慧通 salary, and 爸 2,500 / 哥 2,000 /
媽 3,000 on 2026-01-05.

**One caught by title alone.** 停車位 2,500 — monthly parking, present inside
both cross-year ranges.

## Income that *is* attached

A Project's figure is net (ADR-0009), so a companion settling their share
genuinely reduces what the trip cost. Attached only where the owner confirmed it
row by row, never inferred:

- **`藜` 6,000 + 4,500** (2026-07-29, 07-31) → 日本富士東京之旅. Recorded as
  `refund` income by the 2026-08 catalog migration precisely because such rows
  offset expenses rather than being earnings.

Reviewed and **not** attached:

- **`[韓國]代墊 21,548`** (2023-11-29). Despite the `[韓國]` prefix, the owner
  confirmed the record is correct as income and that it does not belong to the
  trip. Attaching it would have taken Seoul's net from 23,639 to 2,091.

## The cross-year overlap, examined

Both New Year trips contain 01-01, so a whole month's charges and salary land
inside the range. Reviewed row by row: on 2026-01-01 the trip rows (Best Western
福岡天神南 7,800, Uniqlo 11,645, 福岡公車, 租車油錢, 租車ETC, 一蘭拉麵本社, …)
sit interleaved with everyday ones (健保費, 勞保費, 慧通 ×5, 停車位, 約會基金),
in the same categories — 車輛 holds both 租車ETC and the monthly parking space.

**The date range genuinely cannot separate them.** The three signals above do,
and on this sample they separate them completely, with no misclassification found
in either direction.

## 韓國首爾之旅 is title-driven, not date-driven

The declared range holds only 6 rows / 6,058, because the trip was booked weeks
ahead and settled weeks after under a `[韓國]` naming convention:

| When | What | Amount |
|---|---|---|
| 2023-11-25 → 11-28 | `[韓國]` eSIM 544, 韓服 1,140, 南怡島接駁車 1,356, WowPass 292 | 3,332 |
| 2023-12-02 → 12-09 | the 6 in-country rows, already categorised `Travel` | 6,058 |
| 2023-12-11 | `韓國之旅` ×2 | 8,000 |
| 2023-12-29 | `韓國之旅攤銷` | 3,000 |
| 2024-01-10 | `韓國占卜` | 138 |
| 2024-01-31 | `韓國之旅攤銷` — found by the script, outside the manual probe window | 3,111 |

A date sweep over that real footprint would drag in five weeks of ordinary life,
so Seoul is selected by title (`^\[韓國\]`, `^韓國之旅`, `^韓國占卜`) plus its own
short range. Its Project dates stay 12-02 → 12-09: that is when the owner was
actually away, and membership carries the rest.

**This is the general lesson.** Date-driven selection is a convenience, not the
rule. Any future backfill needs both a range and an explicit per-trip
include/exclude list, and must print every row it would touch before writing.

## Read budget

The first version of the script read the whole `transactions` collection on
every run — ~3,800 reads for something meant to be run repeatedly. Three
dry-runs plus the day's other full scans exhausted this ledger's daily quota.

It now reads four windows instead: each trip's own range, plus one wider window
(2023-11-01 → 2024-02-29) for Seoul's scattered rows. Roughly 650 reads.

Remaining budget to finish: one dry-run (~650), then `--commit` (~650 read +
~215 writes), then `recompute_rollups.mjs` (~3,800, a full scan by nature).

## Also noticed, not part of this

- `哥 4,424` and `媽 4,078` (2024-12-31) carry the note `松本清` — repayments for
  purchases made for them during the Kansai trip. Transfers, so no total moves
  either way; listed so the omission is deliberate rather than an oversight.
- The `韓國之旅` rows have a `categoryId` that resolves to no category.
