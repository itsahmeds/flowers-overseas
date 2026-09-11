# TASK-004 — Lint rules `fo/no-direct-order-status-write`, `fo/no-geo-redirect`, `fo/no-float-money`; `import/no-restricted-paths` module boundaries

Row: `TASKS.md` → TASK-004. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-004-lint-domain-rules`. ADR-0006, ADR-0009. `fo/no-float-money` fixture-only in 001 (enforced from spec 005). Tests: T-08, T-09, T-10 + RuleTester for no-float-money (decimal literal / `parseFloat` / `toFixed` invalid; `*_minor` valid).

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#4](https://github.com/itsahmeds/flowers-overseas/pull/4); `/review` pass recorded in `TASKS.md`.
