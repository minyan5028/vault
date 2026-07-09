# ADR-0007: Multi-Currency Accounts

## Status

Accepted.

## Context

Accounts originally assumed a single currency: every transaction stored
`baseAmount == amount` with `fxRate == 1`, account balances summed `baseAmount`,
and the Assets page added balances directly as TWD. This broke down once the
ledger needed real foreign holdings — a USD brokerage account holding US stocks,
a JPY account — where the account's own balance is in USD/JPY, and moving money
in from a TWD account is a currency exchange.

The exchange cannot be eliminated, only placed: either at the deposit (TWD
account → USD account) or at each purchase. We chose real per-currency accounts,
so it lands at the deposit — a genuine cross-currency transfer.

## Decision

- An **account holds one currency**; its balance is accumulated in that currency
  from `amount` (source leg) and a new `toAmount` (destination leg), **not**
  `baseAmount`.
- A **cross-currency transfer** debits `amount` from the source and credits
  `toAmount` to the destination — two different figures. For same-currency
  transfers and all income/expense, `toAmount == amount`.
- **Two FX regimes coexist**, by responsibility:
  - Income/expense **statistics** aggregate `baseAmount`, locked at entry
    (ADR-0002) — history stays deterministic.
  - **Net worth** values each balance at the **current** `meta/fx` rate — it
    reflects today's market, and a foreign balance is shown as
    `US$2,145.44 × 32 = NT$68,654.08`.

## Consequences

**Positive**

- Foreign accounts reconcile with their real-world statements (USD, JPY).
- Buying a foreign holding is same-currency (USD account → USD holding), clean.
- Net worth reflects live exchange rates, consistent with holding valuations.

**Negative**

- Net worth now moves with FX rates (a foreign balance's TWD value fluctuates).
- Cross-currency transfers must capture both legs' amounts.
- Rates live in `meta/fx` and are entered manually (Manage → Exchange rates, or
  the investment price-update form).

## Notes

The migration was zero-impact for existing data: all 3,794 transactions already
had `amount == baseAmount`, so switching balance math from `baseAmount` to
`amount`/`toAmount` changed no existing number. `toAmount` defaults to `amount`
when absent.
