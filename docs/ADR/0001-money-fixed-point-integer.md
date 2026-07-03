# ADR-0001: Money as a Fixed-Point Integer (×100)

## Status

Accepted

## Context

Vault handles multi-currency, high-frequency monetary math (entry, reports,
investments). A core risk in any financial system is floating-point error: the
`number` type in JavaScript/TypeScript is IEEE-754 double precision, so
`0.1 + 0.2 ≠ 0.3`, and such errors accumulate unacceptably over long-term
financial calculations.

## Decision

All monetary values are stored as fixed-point integers scaled by 100:

```
stored = displayed × 100
```

Examples: NT$149.90 → `14990`, US$10.25 → `1025`. All value arithmetic is
integer arithmetic.

## Consequences

**Positive**

- Eliminates floating-point precision error.
- Sums and aggregations are exact integer operations.
- Firestore's native number type (a double) represents these exactly below 2⁵³.

**Negative**

- 3-decimal currencies (KWD, BHD) are unsupported.
- The UI must format on display (÷100) and on store (×100).
- All value math must obey the scaling rule.

**Neutral**

- Developers must understand the "minor units" concept.

## Rationale

Financial correctness > currency completeness. Vault prioritizes long-term
correctness over edge-case coverage.
