# Phase 1 — Executable Task List (MVP)

Goal: the smallest app that replaces Notion for daily use — record an
expense/income/transfer in **under 3 seconds**, see this month, on your phone.

Ordered by **milestone**: build a thin walking skeleton first, then flesh out.
Each task has an acceptance check. Sizes: S ≈ hours, M ≈ 1–2 days, L ≈ 3+ days
(solo, rough). Check off as you go.

Foundational rules for all tasks (see ADRs):

- **Every read/write is scoped by `ledgerId`** — never hardcode a single ledger
  (Phase 2 sharing depends on this).
- **No hardcoded user-facing strings** — every string goes through `t("key")`
  and lives in a locale file (i18n from day one, [ADR-0006](ADR/0006-i18n-from-day-one.md)).
- **Correctness-critical logic ships with unit tests** (money/FX first).

---

## Prerequisites (finish Phase 0 first)

- [ ] **P0-1** Create Firebase project; enable Auth (Google), Firestore, Hosting. — S
- [ ] **P0-2** Firestore **security rules** v1: a user can read/write a ledger's
  data only if they're in `ledgers/{id}.members`. — M
- [ ] **P0-3** Composite index: `transactions` on `(yearMonth ASC, deletedAt ASC, date DESC)`. — S
- [ ] **P0-4** Lock frontend stack: Vite + React + TypeScript, routing, styling
  approach, Firebase SDK. Write it in `docs/` or README. — M
- [ ] **P0-5** Quick-entry UX wireframe agreed (numpad-first, category grid). — M

---

## Milestone 1 — Walking skeleton (sign in → see data)

- [x] **P1-01** App scaffold: Vite + React + TS project, folder structure,
  Firebase SDK initialized from config. — S ✅
  - _Accept:_ `npm run dev` serves the app; build + typecheck pass. Firebase
    connects once `.env.local` is filled from a real project.
- [x] **P1-01b** Foundations from day one: Vitest + i18n (react-i18next, `en` /
  `zh-TW`, type-checked keys). — S ✅
  - _Accept:_ 15 tests green; UI strings resolved via `t()`; language toggle works.
- [ ] **P1-02** Google sign-in / sign-out via Firebase Auth; gate the app behind
  auth. — S
  - _Accept:_ can sign in, see own uid; refresh keeps the session.
- [ ] **P1-03** On first sign-in, ensure a `users/{uid}` doc and a default
  `personal` ledger with the user as `owner`. — S
  - _Accept:_ new account auto-provisions a Personal ledger.
- [ ] **P1-04** Data layer: typed models + a thin repo that takes `ledgerId` and
  reads/writes `accounts`/`categories`/`transactions`. — M
  - _Accept:_ a test screen lists transaction count for the current ledger.
- [ ] **P1-05** Enable Firestore **offline persistence**. — S
  - _Accept:_ with network off, previously loaded data still renders.

---

## Milestone 2 — Real data to build against

- [ ] **P1-06** Admin SDK **loader** script: read `data/migrated/vault-seed.json`,
  remap `owner` → real uid, batch-write ledger + accounts + categories +
  transactions into Firestore. Idempotent (safe to re-run). — M
  - _Accept:_ Firestore shows 6 accounts, 14 categories, 3,144 transactions
    under the Personal ledger; re-running doesn't duplicate.
- [ ] **P1-07** Verify seed integrity in-app: totals match the CSV, no dupes,
  `baseAmount == amount` for all TWD rows. — S
  - _Accept:_ a quick check screen/log confirms counts and a spot-check total.

---

## Milestone 3 — Quick entry (the core, must be <3s)

- [ ] **P1-08** Entry screen shell: type toggle (expense / income / transfer),
  amount display, numeric keypad. — M
  - _Accept:_ can type an amount with the on-screen numpad; ×100 stored correctly.
- [ ] **P1-09** Category picker as an **icon grid**; recent/most-used first
  (Food dominates). Hidden for transfers. — M
  - _Accept:_ tapping a category selects it; recents appear on top.
- [ ] **P1-10** Account selector; date defaults to **today** (editable);
  optional `title` and `note` fields. — M
  - _Accept:_ can set account/date; title optional; note collapsible.
- [ ] **P1-11** Transfer mode: from-account → to-account, no category, both
  legs handled per the model. — M
  - _Accept:_ a transfer records with `accountId`, `toAccountId`, `type=transfer`.
- [ ] **P1-12** Save writes a valid transaction (`yearMonth`, `baseAmount`,
  `fxRate=1`, `createdBy`, timestamps) and returns to the list instantly. — S
  - _Accept:_ a full expense entry takes **≤3 seconds** end-to-end; doc is valid.
- [x] **P1-13** Money formatting helper (÷100 display, ×100 store) with unit
  tests, used everywhere. — S ✅ (`src/lib/money.ts`, 11 tests)
  - _Accept:_ tests cover TWD/USD/JPY and float traps; `12345` ↔ `123.45`.

---

## Milestone 4 — See & fix your money

- [ ] **P1-14** Transaction list: current month, grouped by day, newest first,
  with per-day and month running totals (sum `baseAmount`, exclude transfers
  from spend total). — M
  - _Accept:_ list matches seed for the current month; transfers not counted as spend.
- [ ] **P1-15** Month switcher (prev/next month via `yearMonth`). — S
  - _Accept:_ can page through historical months from the seed.
- [ ] **P1-16** Tap a row → edit; save updates `updatedAt`. — M
  - _Accept:_ edited amount/category persists and re-renders.
- [ ] **P1-17** Soft-delete (set `deletedAt`); deleted rows disappear from lists. — S
  - _Accept:_ deleting hides the row; data still in Firestore.

---

## Milestone 5 — Manage the building blocks

- [x] **P1-18** Category management: list, add, rename, archive (keep history);
  set icon. — M ✅ (Manage screen)
  - _Accept:_ can add a category and use it immediately in entry.
- [x] **P1-19** Account management: list, add, rename, archive; free-form name. — M ✅
  - _Accept:_ can add an account; archived ones hidden from pickers.

---

## Milestone 6 — Make it a daily driver

- [ ] **P1-20** PWA config: manifest, icons, service worker; installable to home
  screen; launches offline. — M
  - _Accept:_ "Add to Home Screen" works; opens offline and can record.
- [ ] **P1-21** Entry is reachable in one tap from app open (e.g. FAB / default
  screen) — protect the 3-second goal. — S
  - _Accept:_ open app → record → done without navigating menus.
- [ ] **P1-22** Deploy to Firebase Hosting; use it on your real phone. — S
  - _Accept:_ live URL, installed on phone, recording real expenses.

---

## Phase 1 Definition of Done

You record on your phone every day for a week against your real 3-year data and
stop opening Notion.

## Suggested order

`P0-* → M1 → M2 → M3 → M4 → M5 → M6`. M2 (real data) before M3 so the entry and
list UI are built against real categories, accounts, and volume — not fixtures.
