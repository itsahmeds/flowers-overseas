# TASK-521 — i18n scope check: API route handlers are not indexable roots

Row: `TASKS.md` → TASK-521. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-521`; keep it current by editing this file, not the row.

## Binding

Spec 003's scope rule: keys named only inside a surface's `paths` must not render on an indexable
page. Route handlers under `src/app/api/` return JSON, redirects or plain responses and render no
indexable HTML, so they are not roots of the import graph. Since PR 523 (TASK-449) the unsubscribe
route and the internal mail-capture route make `pnpm i18n:check` report 49 false findings on main.
Fix: add `src/app/api/` to `NON_INDEXABLE_APP_DIRECTORIES` in `scripts/i18n-check-scope.ts`, extend
its doc comment with the reason, and add one unit case proving an `api` route is not a root while a
`[locale]` page still is. No page, key or catalogue change.

## Read

- `scripts/i18n-check-scope.ts` (lines 55 to 75)
- its unit test under `tests/unit/` (grep `NON_INDEXABLE_APP_DIRECTORIES`)
- `docs/codebase-map.md`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Not started._
