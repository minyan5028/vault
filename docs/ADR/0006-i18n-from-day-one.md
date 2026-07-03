# ADR-0006: Internationalization (and Unit Testing) From Day One

## Status

Accepted

## Context

Two foundational practices are far cheaper to adopt at the start than to
retrofit:

- **i18n** — if components hardcode user-facing strings, adding a second
  language later means hunting every string across the codebase.
- **Unit testing** — money and FX logic must be correct; tests are the guard.

The user (bilingual: English / 繁體中文) wants both established before feature
work begins, consistent with PHILOSOPHY's "Architecture Before Features".

## Decision

- **Unit testing** with **Vitest** from the first module. Money math
  (`lib/money.ts`) and i18n both ship with tests; correctness-critical logic is
  covered before UI is built.
- **Internationalization** with **react-i18next** from the first screen. No
  user-facing string is hardcoded in a component — every string lives in a
  locale JSON and is read via `t("key")`. Translation keys are type-checked
  (`src/i18n/i18next.d.ts`). Initial languages: `en` (fallback) and `zh-TW`.
  Money/dates are formatted with `Intl` (locale-aware), complementing i18n.

## Consequences

**Positive**

- Adding a language is just another JSON file under `src/i18n/locales`.
- No painful string-extraction migration later.
- A test in CI fails if a locale is missing keys, catching untranslated strings.

**Negative**

- Every new string requires a locale entry (small, constant overhead).
- Two extra runtime dependencies (`i18next`, `react-i18next`).

## Rationale

Retrofitting i18n and tests is expensive and error-prone; paying a small,
constant cost up front keeps both the codebase translatable and the money
logic trustworthy for the long haul.
