# TASK-008 — Test harness: `vitest.coverage.json` thresholds, integration suite (`describe.skip` + 002 TODO) with Postgres service job, Playwright `e2e`/`visual`/`a11y` projects + `pseudo-rtl` device stub, MSW skeleton (`onUnhandledRequest: "error"`), `tests/fixtures` barrel + README, smoke tests, preview-run CI jobs

Row: `TASKS.md` → TASK-008. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-008-test-harness`. `PLAYWRIGHT_BASE_URL` = preview in CI, `localhost:3000` locally; visual baseline for `/` committed; axe zero serious/critical (§8 accessibility). Tests: T-15, T-16, T-17, T-18, T-19. From review of PR #7: add the `test:unit` CI job here (252 unit tests currently ungated in CI); wait-for-preview step should filter out deployments labelled `Production`; T-15 asserts `application/json` prefix. PR #8 green (13/13 checks). Two decisions for the reviewer, both in the PR body: (a) axe reports `document-title` (serious) on the copy-less shell, so the a11y test asserts the serious/critical set *equals* `["document-title"]` (self-clearing when spec 003 adds the localised title) rather than zero; (b) Vercel injects `vercel.live/_next-live/feedback/feedback.js` into protected previews, so T-16 allows that one origin on non-local targets (removable by turning Comments off in the Vercel project settings). Visual baselines are platform-agnostic while the shell has no text/fonts — spec 004 must switch to per-platform baselines.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#8](https://github.com/itsahmeds/flowers-overseas/pull/8); `/review` pass recorded in `TASKS.md`.
