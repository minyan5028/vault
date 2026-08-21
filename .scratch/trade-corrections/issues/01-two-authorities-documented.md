# 01 — Name the two authorities

**What to build:** Documentation only. Record the model the rest of this feature
depends on, so the code that follows uses settled vocabulary.

[ADR-0010](../../../docs/ADR/0010-trades-own-cost-basis.md) states the decision:
trades own `cost` and `realizedGain`, snapshots own `shares`, `price` and
`pricedAt`, DRIP is derived and never stored. It records why a `drip` trade kind
was rejected, why the cost replay folds over traded shares rather than held ones,
and the stock-split limitation that follows.

`CONTEXT.md` gains **Trade**, **Portfolio Snapshot**, **Traded Shares · Held
Shares** and **DRIP**, since none of these appear in `SPEC.md` — they emerged
from the code.

The negative consequence is the one worth being loudest about: `shares`, `cost`
and `price` are deliberately not editable on the Holding. Anyone reading the
edit form in a year will assume that is unfinished work.

**Blocked by:** nothing.

**Status:** resolved

- [x] ADR-0010 exists, is listed in `docs/ADR/README.md`, and follows the repo's
      Status · Context · Decision · Consequences · Rationale template
- [x] It records the rejected alternatives — the `drip` trade kind, and replaying
      cost against snapshot-reconstructed held shares
- [x] It states that `shares`/`cost`/`price` are deliberately not editable on the
      Holding, so the omission cannot be mistaken for an oversight
- [x] It records the stock-split limitation with its actual blast radius:
      dividend-class holdings only, no effect on net worth
- [x] `CONTEXT.md` defines the four terms without implementation detail beyond
      the file pointers its existing entries already use
- [x] `CONTEXT.md` states that a trade's share count differing from the holding's
      is the model, not a discrepancy
