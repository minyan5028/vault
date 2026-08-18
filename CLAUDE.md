# Vault

A personal finance app. The domain, the architecture, and the reasoning behind
both live in `docs/` — start with `docs/PHILOSOPHY.md`, then `docs/SPEC.md`, then
`docs/ADR/`.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this
repo — there is no external tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root, ADRs in `docs/ADR/` (uppercase).
See `docs/agents/domain.md`.
