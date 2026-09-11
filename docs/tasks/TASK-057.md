# TASK-057 — CI on demand for the Actions-minutes budget: `ci.yml` triggers only on `ready_for_review`, `labeled` and `workflow_dispatch`; the spine (`lint`, `typecheck`, `test-unit`, `build`) runs once per PR marked ready; fan-out jobs, `commitlint` and the preview → Playwright → Lighthouse chain behind the `ci:full` label; `pr-policy` on ready/label events; spec 001 §14 A14; implementer and reviewer agents told to draft first, run gates locally, push once, `gh pr ready`

Row: `TASKS.md` → TASK-057. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Founder report 2026-09-09: 90% of GitHub Free's 2,000 monthly minutes used with a month left. Full run ≈ 30 min, spine ≈ 7 min. Job set unchanged, so `ci-workflow.test.ts` and `branch-protection.test.ts` still pin 18 jobs. Revisit: public repository or a paid Actions plan → restore the full triggers.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR main (direct `ci`/`docs` commits, 2026-09-09); `/review` pass recorded in `TASKS.md`.
