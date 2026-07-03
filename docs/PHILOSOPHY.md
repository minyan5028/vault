# Vault Philosophy

> Build once. Grow for life.

Vault is not designed around features.

It is designed around principles.

Features will change.

Frameworks will change.

Technologies will change.

The philosophy should not.

This document defines the beliefs that guide every product and engineering decision made in Vault.

---

# The North Star

> **Optimize the common path. Enable the uncommon path.**

Every product eventually becomes more capable.

Very few become more usable.

Vault deliberately separates **frequency** from **complexity**.

Tasks performed every day should require almost no thought.

Tasks performed occasionally may expose more advanced workflows.

Complexity is not the enemy.

Unnecessary friction is.

---

# Reality First

Vault records reality.

Not intentions.

Not plans.

Not assumptions.

Every record represents something that actually happened.

Examples:

* An expense occurred.
* A salary was received.
* A stock was purchased.
* A dividend was paid.
* Money was transferred.

Budgets, reports, forecasts, and AI insights exist because reality has already been recorded.

Reality is the foundation.

Everything else is derived.

---

# Events Over Features

Vault is built around **Financial Events**, not product features.

Expense tracking is not the core.

Budgeting is not the core.

Investment tracking is not the core.

The core is a consistent model capable of describing financial events.

Every new capability should naturally emerge from that model instead of introducing a separate system.

The domain model comes first.

Features come second.

---

# Fast Where It Matters

Not every workflow needs to be fast.

The workflows performed every day do.

Recording an expense should take only a few seconds.

Opening today's transactions should feel instant.

Changing categories should not interrupt the recording flow.

By contrast, reviewing yearly investments or configuring a shared ledger can take longer.

Optimization follows frequency, not complexity.

---

# Simple by Design

Vault intentionally supports sophisticated financial scenarios.

Simplicity is achieved through thoughtful design—not by removing functionality.

Advanced capabilities should exist where they belong.

They should never interfere with common workflows.

A beginner should never be overwhelmed.

A power user should never feel constrained.

---

# Grow Without Migration

People change.

Financial lives become more complex.

Students become professionals.

Professionals build families.

Families buy homes.

Investors accumulate assets.

Most financial software eventually requires users to migrate.

Vault should not.

New capabilities should extend existing data rather than replace it.

Growth should happen through evolution, never migration.

---

# Data Outlives Software

Software is temporary.

Financial history is not.

Vault treats data as the primary asset.

Applications, frameworks, and user interfaces are replaceable.

Financial records are not.

Every design decision should preserve long-term ownership of data.

Importing should be possible.

Exporting should always remain possible.

---

# Architecture Before Features

Architectural decisions are significantly harder to change than user interface decisions.

When faced with a choice between:

* implementing quickly, or
* building a durable foundation,

Vault favors the foundation.

Shortcuts that introduce future redesign should be avoided whenever possible.

---

# Build for Decades

Vault is expected to evolve over many years.

Technology choices should optimize for longevity rather than novelty.

The newest framework is not automatically the best choice.

Operational simplicity is preferred over technical sophistication.

Maintainability is a product feature.

---

# Human Time Is More Valuable Than CPU Time

Computers are fast.

People are not.

Vault optimizes for reducing human effort before reducing machine effort.

Saving a user five seconds every day is more valuable than saving the database five milliseconds.

Whenever trade-offs exist, prioritize the user's cognitive load over computational elegance.

---

# Every Feature Must Earn Its Place

Adding a feature is easy.

Maintaining it for ten years is not.

Every proposed feature should answer at least one question:

* Does it reduce friction?
* Does it improve clarity?
* Does it extend the financial model?
* Does it preserve long-term maintainability?

If the answer is no, the feature probably does not belong in Vault.

---

# A Living Philosophy

This document is intentionally stable.

New ideas may be added.

Existing principles should rarely change.

The philosophy defines Vault's identity.

The implementation exists to serve it.
