# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/ADR/`** (uppercase in this repo) — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/ADR/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

**This repo is single-context** — the layout below on the left:

```
/
├── CONTEXT.md
├── docs/ADR/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/ADR/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/ADR/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/ADR/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## This repo's ADR conventions

- ADRs live in **`docs/ADR/`**, numbered `NNNN-slug.md`, and are indexed in
  `docs/ADR/README.md` — add a row there when adding an ADR.
- The template is fuller than the skill's minimal one:
  **Status · Context · Decision · Consequences · Rationale**, usually followed by
  `## Notes` and `### Open questions`.
- ADRs are immutable once accepted. To change a decision, add a new ADR that
  supersedes the old one. Correcting a *false implementation premise* attached to
  a decision (not the decision itself) is instead recorded as a dated
  `## Amendment` section at the bottom of the existing ADR — see ADR-0008.
- The domain vocabulary lives in `docs/SPEC.md`, not `CONTEXT.md`. The root
  `CONTEXT.md` deliberately holds only terms that emerged from the *code* and
  that `SPEC.md` does not define. If a term belongs to the business domain, it
  belongs in `SPEC.md`.
