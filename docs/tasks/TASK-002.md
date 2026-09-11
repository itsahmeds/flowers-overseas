# TASK-002 — Git hooks and PR policy: husky + lint-staged + commitlint, minimal `ci.yml` (lint → typecheck → build), `pr-policy.yml`

Row: `TASKS.md` → TASK-002. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-002-hooks-pr-policy`. Title regex, branch regex, bot + `no-task` exemption per §13 Q5; commitlint on PR commits. Later tasks append their own `ci.yml` jobs; final job set/order verified in TASK-011. Tests: T-20 (throwaway PR or `act`), T-21.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#2](https://github.com/itsahmeds/flowers-overseas/pull/2); `/review` pass recorded in `TASKS.md`.
