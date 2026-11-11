# TASK-522 — Main reds sweep

Row: `TASKS.md` → TASK-522. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-522`; keep it current by editing this file, not the row.

## Binding

Gates on main must be green: a builder may not inherit reds. Fix each red unit test or check on main at dispatch without behaviour change (stale lists, missing meta rows, formatting, import-boundary violations). Where a red is a real defect, do not paper over it: report it with file:line. Known at row time (2026-11-11): `i18n-review-scope`, `i18n-messages` namespaces, `check:no-db` on two `src/modules/analytics` imports, `format:check` on `src/lib/csp.ts`.

## Read

- `docs/codebase-map.md`
- each failing test file and the code it names

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Not started._
