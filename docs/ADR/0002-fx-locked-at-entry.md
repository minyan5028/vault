# ADR-0002: FX Locked at Entry (Base-Amount Snapshot)

## Status

Accepted. Merges the two originally separate records "FX rate is locked at entry
time" and "base-amount snapshot at write time" — they described the same
decision.

## Context

Foreign-currency transactions raise one question: should historical totals
change when exchange rates change? If conversion is performed at query time, a
JPY expense recorded today would be re-valued tomorrow — past reports shift and
become non-deterministic, violating Reality First, and every report gains a
runtime dependency on external FX data.

## Decision

Each Financial Event stores, computed at entry time:

- `amount` (original) and `currency` (original)
- `fxRate`, captured at entry
- `baseAmount = round(amount × fxRate)`, a fixed snapshot in `baseCurrency`

All reports aggregate `baseAmount` only; no conversion is re-evaluated later.
`fxRate` is retained for display and audit and is **never** used to recompute
`baseAmount`.

## Consequences

**Positive**

- Historical financial reality is stable; reports are deterministic.
- No runtime dependency on external FX data for past correctness.
- Fast aggregation (summing a single integer field).

**Negative**

- A holding's live "current value" is not represented by past events.
- FX accuracy cannot be improved retroactively.
- Correct FX must be captured at entry time.

## Rationale

Vault records what was true at the time, not what is true today:
deterministic history > dynamic accuracy.
