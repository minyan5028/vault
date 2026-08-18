# ADR-0008: Expense taxonomy organized by compressibility

## Status

Accepted.

## Context

The expense catalog had drifted. Categories were added when a transaction did
not fit an existing one, never against a stated principle, so the table mixed
three incompatible ideas: life domains (`Food`, `Traffic`, `Health`), fixed
obligations (`Insurance` holding 勞健保 alongside 停車位), and tax accounting
(`Tax`). Nothing said which idea won when they disagreed, so the same purchase
could land in three different places depending on the month.

A first cleanup (`scripts/migrate_catalog_2026.mjs`, applied 2026-07) merged the
long-tail categories, added 居住 and 通訊訂閱, and moved rent and telecom out of
the buckets where they had been miscoded. It fixed real problems but was decided
transaction-by-transaction, and **its reasoning survived only in a commit
message**. A later review re-derived the same findings from scratch and reported
already-fixed issues as new ones. That failure is the direct reason this ADR
exists.

The remaining defects were structural, not clerical:

- `Food` (18,900/mo) mixed grocery runs — 8,386, unavoidable — with restaurants
  — 10,514, entirely discretionary.
- `Traffic` (21,470/mo) mixed running a car — parking, insurance, fuel tax,
  petrol — with discretionary travel — flights, car rental, long-distance rail.
- `稅務保險` mixed statutory 勞健保, commercial policies, income tax, **and** two
  vehicle costs that had no business being there.
- One policy was recorded under two names (`失能險保費` 2023-09 and `國泰長照險`
  2024/2025-09 — same NT$13,741, same month, three consecutive years), which
  inflated the apparent commercial-premium load by a third.
- 1,093 titles across 3,144 transactions; 801 appeared exactly once. `title` was
  carrying item detail (`Costco蛋白粉`, `iPad Air 5 保護貼`) that belongs in
  `note`, which was `null` on every recurring rule and nearly every transaction.

The question underneath all of it: **what are categories for?** Three answers
were considered — describe life structure, control a budget, or map to tax
accounts. They produce different tables, and no table is right for all three.

## Decision

**Expense categories are organized by compressibility — how much discretion the
owner has over the money — not by life domain.**

Categories are grouped into three bands. The band is not stored anywhere; it is
a property of the category, documented in this table and nowhere else. (As
originally written this sentence continued "and reflected in `sortOrder`" — see
the amendment below.)

| Band | Categories | Share of spend |
|------|-----------|----------------|
| **固定義務** — contractual or statutory; changing it means terminating something | 車輛 · 居住 · 稅務保險 · Family · 通訊訂閱 | 51.6% |
| **必要變動** — unavoidable, but the amount is controllable | 食材採買 · Health · 日用品 | 16.2% |
| **可選消費** — can simply not be spent | 外食 · Fun · 治裝美容 · Travel · 家居 · 共同帳戶 · Other | 32.2% |

Consequences for the table:

- `food` is **reused as 外食**; grocery-chain spend splits out into a new
  `fresh` (食材採買). Reuse runs with the larger half — 1,383 rows stay put and
  555 move.
- `traffic` is **reused as 車輛** and absorbs 停車位, 汽車保費 and motorcycle
  costs from `稅務保險`; public transport moves to `Travel`.
- `groceries` is **reused as 日用品** (consumables); durables — furniture,
  appliances, homeware — split out into a new `home` (家居).
- Categories keep their ids across renames. An id is an identifier, not a label.

**Naming contract:** `title` is the **merchant or payee**; `note` is **what was
bought**. One merchant, one title.

**Splitting rule:** a purchase is split into separate transactions when it
crosses a band, and additionally between 食材採買 and 日用品. Within a band and
otherwise, a single row is enough.

**History** is reclassified using each transaction's *existing category* as the
record of what was bought — the owner's original filing is the only surviving
evidence of a receipt's contents, and it is trustworthy because it was made at
the time. Where it is not (7 rows filed under `Other`), the rows were resolved
individually rather than by rule.

## Consequences

**Positive**

- The table answers the question it is asked. "Where did I overspend?" is
  answered by one number — 可選消費, 28,912/mo — instead of by reading thirteen
  rows and judging each.
- Fixed cost becomes visible as a total. 51.6% of spending is contractual; that
  figure was not previously computable from the catalog.
- Category totals stop moving for reasons unrelated to behaviour. 居住 no longer
  changes when a Costco run is filed differently.
- Title convergence makes the existing title autocomplete useful — its real
  problem was 801 single-use titles, not the widget.

**Negative**

- Categories are no longer self-evident from a receipt. Filing 停車位 under 車輛
  rather than 居住 requires knowing the principle, which is why it is written
  down here.
- Splitting cost. A Costco run that crosses bands now needs two or three rows.
  Measured against history this is modest — 17% of grocery visits were already
  recorded as multiple rows — but it is a real ongoing tax on recording.
- No category is perfectly homogeneous. 加油費 is semi-fixed; the 皮膚診所 visit
  inside `Health` is effectively a subscription. The band is the category's
  dominant tendency, not a guarantee about every row.
- The compressibility axis is a **personal** judgement. 匯給媽 sits in 固定義務
  because this owner treats it as non-negotiable; that is not a general truth.

## Rationale

The alternative axes were rejected for concrete reasons rather than taste.

**Life structure** was chosen first and reversed. It produces a table that is
easy to file into but cannot be acted on: it puts rent and a restaurant meal on
the same footing as "money spent living", which is exactly the distinction the
owner needs. It also leaves compressibility with nowhere to live — an attempt to
recover it via a per-transaction flag or via the recurring rules failed, because
`materializeRecurring` stamps no back-reference onto the transactions it
generates, so a materialized row is indistinguishable from a manual one.

**Tax accounting** was rejected because the ledger is not used for filing; only
two rows a year are tax-relevant.

**A three-category table** (fixed / necessary / discretionary and nothing else)
was rejected because it discards actionable detail — "外食 is 10,514/mo" is a
decision the owner can make; "可選消費 is 28,912/mo" is not.

## Notes

Applied by `scripts/migrate_catalog_2026_08.mjs`, dry-run by default. Rollups
must be rebuilt afterwards (`recompute_rollups.mjs`). Balances are untouched: no
amount, account or transaction type changes, and the expense total is asserted
to be conserved.

Explicitly out of scope: the `約會基金` / `Couple's` account modelling (left as
is, deliberately); the 801 single-use long-tail titles; renaming the categories
still carrying English labels (`Fun`, `Family`, `Health`, `Travel`, `Other`).

### Open questions

- **2025 has no car-insurance record at all.** Premiums exist for 2024-01
  (NT$8,057), 2026-02 (NT$9,047) and 2026-06 (NT$11,776, the new LuxgenU5) —
  nothing in between. Either a year was never recorded, or the previous car went
  uninsured. Unresolved; worth reconciling against the actual policy documents.
- The recurring salary rule was found at NT$52,656 against a base of NT$65,070
  running through 2026-05. This turned out to be correct — base pay fell 19.1%
  from 2026-06 — but the discrepancy was indistinguishable from a stale rule.
  Recurring rule amounts have no drift detection.

---

## Amendment 2026-08-18 — `sortOrder` no longer encodes the bands

The decision above stands unchanged. What is withdrawn is one implementation
claim attached to it: that the three bands are *reflected in* `sortOrder`.

They should never have been. No screen reads the bands out of that field —
Stats sorts its rows by amount and uses categories only as an id→name lookup,
the Timeline only filters. `sortOrder`'s sole consumers are the Quick Entry
category grid and the Manage list. Encoding the bands into it bought nothing and
cost real ergonomics, because the band order puts 固定義務 first, and 固定義務 is
precisely the set that arrives through `materializeRecurring` — rent, insurance,
telecom — and never passes through Quick Entry at all. The picker was ordered
almost exactly inversely to how often each category is typed.

It was also not merely cosmetic. Quick Entry preselects the first non-archived
expense category by `sortOrder`, so every new expense opened with 🚗 車輛 already
selected, and anything saved without changing it was silently misfiled.

**`sortOrder` now encodes manual-entry frequency**, its only real consumer.
Applied by `scripts/migrate_catalog_2026_08.mjs`, whose `BANDS` constant is
retained as the documented band membership but no longer determines the order.

Recorded here rather than as a new ADR because no decision is being reversed —
the compressibility taxonomy is untouched, and a display field's ordering is not
a decision an ADR exists to protect. Amended while drafting
[ADR-0009](0009-projects-as-second-axis.md), which found the defect.
