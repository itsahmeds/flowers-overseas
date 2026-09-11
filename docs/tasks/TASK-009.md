# TASK-009 — SEO validator CLIs (`validate-sitemap`, `validate-hreflang`, `validate-schema`) with failure-path unit tests, `tests/fixtures/seo/` (+ `lighthouse-urls.json`), `lighthouserc.json` budgets, `seo:validate` + `lighthouse` CI jobs

Row: `TASKS.md` → TASK-009. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-009-seo-validators-lighthouse`. §6 harness contract with spec 007 (`@type` allow-list from `plan/02` §9, `Offer.price == visiblePrice`). Lighthouse informational until spec 004 (§13 Q4) but assertions must already pass on `/`. Tests: T-23, T-24. AC-23 pass clause deferred to spec 004 (ruled 2026-09-07; correction queued on TASK-012).

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/02`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#9](https://github.com/itsahmeds/flowers-overseas/pull/9); `/review` pass recorded in `TASKS.md`.
