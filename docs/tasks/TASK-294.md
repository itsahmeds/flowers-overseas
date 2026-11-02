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

- **2026-11-02 (CMS2 finisher, self-review):** `pnpm db:check` and `tests/unit/db-migrate.test.ts` fail on this branch alone ("0033 does not continue the sequence (expected 0031)") until PR 450 (0031) and PR 448 (0032) merge; merge them first. The zero and same-value cases of `country_price_guard()` were not exercised (zero is already refused by `country_price_retail_minor_check`, `> 0`, from 0003). T-04's `docker history` step and the e2e half of T-41 are CI's.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-02, build safety (CMS2 finisher; to the orchestrator, open).** The orchestrator asked for a file-catalogue fallback with a loud log line when `DATABASE_BUILD_URL` is unset, unless the spec forbids it. It does: spec 012b §2.0 item 2 ("There is **no fallback to the repository files**"), AC-3 (the database providers in `production`, `staging` and `preview`) and AC-4, and `src/lib/db.ts` (TASK-292) already throws naming the key. Not built. Consequence: once PR 449 merges, every Railway build whose `APP_ENV` is `staging`, `production` or `preview` fails with `DATABASE_BUILD_URL is missing or is not a postgres:// connection string ... (spec 012b AC-4)` until the founder sets the variable (§12 founder action 4); Railway keeps serving the previous deployment. PR environments (`preview`) also need it, although `src/lib/railway.ts` says no PR environment builds from the database. Merge only after the variable is set in staging, or amend the spec.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._
- 2026-11-02 WIP: done: migration 0026 (saleable_offer view, price guard, publish_run, audit), DB composition roots and country registry cutover, parity script, existence manifest and `existenceHash` on /api/health, publish state machine, store, runtime and jobs, §5.4 command tags (T-09), unit tests and integration tests (catalogue-cms-schema) green when last run. Left: /admin/publish page and action (written, not typechecked), admin home counters, `urlsForTag` additions, `cache:warm`, listing grid manifest filter, existence.ts unit tests, re-run integration suite, gates:cheap, briefs 295/296 Result, Self-review, ready.
- 2026-11-02 CMS2 finisher: rebased the four commits onto main 74f6baa83, then bc7f5b2a6; migration renumbered `0033_catalogue_cms` (main holds 0026-0030, PR 450 holds 0031, PR 448 0032); its audit mask list and rollback keep 0029's `review` columns; `media_asset_supplier_partner_check` narrowed to `kind = 'product'` (a partner delivery proof or application photo has no catalogue supplier); main's new file-registry readers (chooser, apply form, dev gallery) moved to the served registry; db-check snapshot regenerated; the integration suites run green on a local PG16 with the migration numbered 0031 locally (contiguity).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#449](https://github.com/itsahmeds/flowers-overseas/pull/449), one feature PR for TASK-294, TASK-295 and TASK-296. Migration `0033_catalogue_cms` with its rollback: `country.first_live_at`, `product.first_active_at` and the price-row guard, `saleable_offer` (ids only, owner rights, read by `app_web` and `app_build`), `media_asset.supplier_partner_id` (required for a partner bouquet photo), `publish_run`, the audit trigger on twelve tables, the placeholder-window flag row. The catalogue, price and country composition roots select the database in `production`, `staging` and `preview` (`catalogSourceFor`, `activeCountries()`), with no fallback; `availability()` composes `isSaleable` in `production` and `staging`. Tests: unit `catalog-cutover` (T-03 source scan, composition per environment), `catalogue-parity-catalogue`; integration `catalogue-cms-schema` (12 cases: AC-2 seeded parity, AC-39 saleability through the view and the module, the build role and `app_web` refused partner tables, F2 price guard, `first_active_at`, `first_live_at`, the supplier rule, AC-6's index), `build-role` (parity CLI as `app_build`), `migrations-round-trip`, `audit-trail`, `rls-policies`, `seed`, `seed-insert-only`, `catalog-db-providers`, `reviews-migration`, `order-integrity`, `florists-schema`: all green on a local PG16 (eleven files). Handed on: the build needs `DATABASE_BUILD_URL` (escalation above).
