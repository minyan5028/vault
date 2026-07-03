# Vault UX Specification

> Design for speed. Preserve cognitive energy.

Vault is a Financial Operating System designed around one dominant interaction:

> **Recording a Financial Event in under 3 seconds.**

All UX decisions must support this constraint.

---

# Core UX Principle

## Minimize Cognitive Load

Users should never need to think about:

* Data structure
* Categories hierarchy
* Account models
* Currency handling
* Synchronization state

The system should absorb complexity, not expose it.

---

## Optimize for Frequency, Not Features

Vault is not designed around feature discoverability.

It is designed around repeated daily behavior:

* Add expense
* Add income
* Check balance
* Review monthly spending

Everything else is secondary.

---

## One Primary Interaction: Quick Entry

The Quick Entry flow is the center of Vault.

If users remember only one thing, it is this:

> Open → Enter → Done

---

# Quick Entry Flow (Critical Path)

Target time: **≤ 3 seconds**

## Step 1 — Open

Vault opens on the **Timeline** (recent entries). A bottom-right **＋ (FAB)**
opens Quick Entry.

This mirrors Money Manager (a tool the user finds fast): landing on the list
gives immediate context, and the FAB tap is negligible (<0.5s) against the
3-second goal. For the fastest path, a home-screen **shortcut or widget** can
jump straight into Quick Entry, bypassing the Timeline.

No heavy dashboard, no loading gate — the list and the ＋ are the whole home.

---

## Step 2 — Input

Default state assumes:

* Type: Expense
* Date: Today
* Account: Last used account
* Category: Most frequently used category

User only modifies what is necessary.

---

## Step 3 — Confirm

User confirms entry via:

* Single tap OR
* Enter key OR
* Auto-save after input completion

No additional screens.

No confirmation dialogs.

---

# Quick Entry Layout

The screen is optimized for thumb usage and speed.

## Primary Input Zone

* Amount (numeric first focus)
* Currency implicit (based on account)
* Instant validation

---

## Secondary Inputs (Optional)

* Category (icon grid)
* Account selector
* Title (default visible, optional)
* Note (hidden behind expansion)

---

## Interaction Rules

* Amount input always focuses first
* Category defaults are predictive
* Account defaults to last used
* Date defaults to today
* Title is optional, not required

---

# Category UX Model

Categories are not navigated hierarchically in daily use.

Instead:

* Frequently used categories are surfaced first
* Rare categories are hidden under "more"
* System learns usage frequency over time

> Users select, they do not browse.

---

# Account UX Model

Accounts behave as:

> "Where did this money come from / go to?"

Not as a bookkeeping system.

UX rules:

* Default = last used account
* Transfers use dual-account selection
* Account switching is rare, not constant

Account balances are derived from events and belong to the review surface
(Timeline / Analytics), not the quick-entry path.

---

# Timeline View (Secondary Screen)

The timeline is the main review interface.

## Layout

* Grouped by day
* Reverse chronological order
* Each entry shows:

  * Title
  * Amount
  * Category icon
  * Account indicator

---

## Interaction Rules

* Tap → edit
* Swipe → delete (soft delete)
* Long press → additional actions

No complex navigation hierarchy.

---

# Editing UX

Editing a Financial Event follows the same flow as creation.

Rules:

* Same screen as Quick Entry
* Pre-filled data
* No separate edit mode
* Save updates the existing event in place (same id, preserves `createdAt`)

---

# Deletion UX

Deletion is always:

> Soft delete (visually removed, logically preserved)

UX behavior:

* Immediate removal from list
* No confirmation dialog (except long-press optional setting)
* Undo available for short window

---

# Currency UX

Currency is intentionally hidden in most cases.

Rules:

* User sees local currency by default
* FX details are not shown during entry
* Exchange rate is not user-facing unless explicitly requested
* Base currency is assumed, not selected

> Complexity is moved away from interaction layer.

---

# Defaults Are the Product

Vault UX heavily relies on intelligent defaults.

Default hierarchy:

1. Last used value
2. Most frequent value
3. System default (ledger-level)

Examples:

* Category
* Account
* Transaction type
* Title suggestions

---

# Perceived Speed > Actual Speed

Even if backend operations take time:

* UI must respond instantly
* Optimistic updates are required
* Sync state is hidden

Users should never wait for confirmation of recording.

---

# Error Handling Philosophy

Errors should be rare in UX.

When they occur:

* Do not interrupt flow
* Show inline correction
* Avoid modal dialogs

Critical failures only:

* Authentication loss
* Network persistence failure

---

# Information Hierarchy

Vault UI is structured as:

```
Timeline (home surface on launch)
    │  tap ＋ (FAB)
    ▼
Quick Entry (primary action — most frequent)
    ↓
Analytics (secondary)
    ↓
Settings (minimal)
```

The Timeline is where users land and review; recording via Quick Entry is the
most frequent action, reached in one tap from the FAB (or directly via a
shortcut/widget).

---

# Design Constraint: 3 Seconds

All UX decisions must satisfy:

> Can this still be completed in under 3 seconds?

If not:

* It belongs in a secondary flow
* Or it must be simplified via defaults

---

# UX Philosophy Alignment

This UX spec enforces PHILOSOPHY.md principles:

* Optimize the Common Path → Quick Entry
* Reality First → immediate recording
* Simple by Design → hidden complexity
* Grow Without Migration → scalable flows
* Human Time > CPU Time → instant interaction

---

# Future UX Extensions

Planned expansions must not break core flow:

* AI-assisted categorization (inline suggestions)
* Voice input for quick entry
* Recurring transaction shortcuts
* Gesture-based entry
* Widget-based mobile shortcuts

All must preserve:

> Open → Enter → Done

---

# UX Goal

Vault UX succeeds if:

> A user can record a financial event without thinking.

The system should disappear during use, and reappear only when reviewing data.
