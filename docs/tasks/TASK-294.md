# TASK-294 — Spec 012b the cutover

Row: `TASKS.md` → TASK-294. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 3. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-2 (catalogue and price half), AC-3, AC-39 (saleability half); tests T-02, T-03, T-41 (saleability half).
- After TASK-292, TASK-293 and TASK-070 (whose providers are the cutover's, §12 requirement on spec 005).
- `availability()` composes `isSaleable` in `production` and `staging` only; placement re-checks it (spec 010).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a migration, money and order placement.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/catalog` composition root, `src/modules/geo`, `db/migrations/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-11 (implementer, self-review):** (1) **Database-mode build not yet green.** With a build login set (local PG16, seeded, `app_build`), `pnpm build` now gets past the country registry (build snapshot) and renders 3511 of 3539 pages, then fails on `/api/prices/{locale}/{iso2}`: each document reads every product's prices one SKU at a time through `src/modules/catalog/db/read.ts` (about 100 to 200 ms per read on the laptop), over Next's 60 s static-generation limit. Needs batched reads in the database providers (TASK-070's code) or a measured `staticPageGenerationTimeout`, before the founder sets `DATABASE_BUILD_URL`. (2) Main's own reds, untouched here: `tests/unit/catalog-barrel.test.ts` (`ga4ProductFacts` not in the documented surface; the discount form reaches the catalogue barrel from a client entry), `tests/unit/no-db-imports.test.ts` (`src/modules/analytics/outbox/handler.ts`, `src/modules/analytics/record.ts` import `drizzle-orm`), `tests/unit/admin-flags.test.tsx` (no confirmation for `risk.gate`, `risk.pay_pause`). (3) PR 449 (TASK-295, TASK-296 and this task's old half) is superseded for TASK-294 by PR 537; its full head is kept on `archive/pr449-tasks-294-296` for TASK-295/296 to rebase onto this migration. (4) T-04's `docker history` step and the e2e half of T-41 are CI's; the zero and same-value cases of `country_price_guard()` were not exercised (zero is refused by `country_price_retail_minor_check` from 0003).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-11, build safety (implementer; orchestrator's order, recorded as a deviation).** The orchestrator's work order of 2026-11-11 says: every page must still build with no database at build time, and if the spec makes the build depend on `DATABASE_BUILD_URL`, keep a fallback so staging still builds without it, and say so. Spec 012b §2.0 item 2 ("no fallback to the repository files"), AC-3 and AC-4 say otherwise. Built as ordered, as one switch rather than a per-read fallback: `cmsSourceFor()` (`src/config/countries.ts`) selects the database in `production`, `staging` and `preview` only while the deployment carries the build login (`buildDatabaseConfigured()`, `src/lib/build-login.ts`); without it the build **and** the server serve the files (so shown = charged in either state: both read the same variable), no saleability term is composed, and boot logs `catalogue.source_fallback`. With the login set, AC-3 and AC-4 hold as written (an unreachable database fails the build). Open for the founder or the spec writer: amend §2.0 item 2 and AC-3 to name the switch, or remove it once the variable is set everywhere.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer: rebuilt from main `7981a6bb3` (then `dd8844389`) with only TASK-294's commits from PR 449 (the publish and existence work of TASK-295/296 stays on `archive/pr449-tasks-294-296`); migration renumbered `0044_catalogue_cms`, its mask list now built on 0041's; parity's catalogue half; main's new file-registry readers (chooser, apply form, application alert, dev gallery) moved to the served registry; the build-login switch; the build snapshot of the country registry; the before-invalidate hooks moved out of `cache.ts`. Clean-env staging build green; database-mode build blocked on the prices route timeout (carry-forward 1).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#537](https://github.com/itsahmeds/flowers-overseas/pull/537). Migration `0044_catalogue_cms` with its rollback (`country.first_live_at`, `product.first_active_at` and `country_price_guard()`, `saleable_offer`, `media_asset.supplier_partner_id`, `publish_run`, the audit trigger on the twelve tables, the attester mask). The catalogue, price, saleability and country composition roots select the database in `production`, `staging` and `preview` while the deployment carries `DATABASE_BUILD_URL`, and the repository files otherwise (the orchestrator's staging fallback, Escalations); `availability()` composes `isSaleable` in `production` and `staging`. Tests: unit `catalog-cutover` (T-03 composition per environment and per login, the fallback, the source scan), `country-registry-build-step` (new, 7), `catalogue-parity-catalogue`, `db` (the key's readers), `db-migrate`, `country-registry`; integration on a local PG16: `catalogue-cms-schema`, `catalog-db-providers`, `seed`, `seed-insert-only`, `audit-trail`, `migrations-round-trip`, `build-role`, `rls-policies`, all green. The clean-env staging build (no database) passes; the database-mode build is carry-forward 1. No new user-facing text.
