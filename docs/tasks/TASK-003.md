# TASK-003 — Lint rules `fo/no-physical-css` (+ Stylelint disallow list) and `fo/no-literal-strings`; local `fo/` plugin skeleton; `tests/fixtures/lint/` excluded from main lint

Row: `TASKS.md` → TASK-003. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-003-lint-css-i18n-rules`. Mechanises §7 (logical CSS, no literal strings). AC-6 check ships as a script/unit test (T-07). Tests: T-04, T-05, T-06, T-07. Deviation: spec §5 names Stylelint `declaration-property-disallowed-list`, which does not exist in Stylelint 17; implemented as `property-disallowed-list` + `declaration-property-value-disallowed-list`. Fixtures stay excluded from `pnpm lint`; `pnpm lint:fixtures` is the executable form of AC-4/AC-5.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#3](https://github.com/itsahmeds/flowers-overseas/pull/3); `/review` pass recorded in `TASKS.md`.
