# TASK-295 — Spec 012b publishing, part 1

Row: `TASKS.md` → TASK-295. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 4 (first half). Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-5 (resolver, sitemap and hreflang half), AC-6, AC-7, AC-8, AC-38; tests T-05 (that half), T-06, T-07, T-08, T-40.
- §12 task 4 is split in two by the advisor's own suggestion ("resolver and sitemaps, then listings and links"); TASK-296 is the second half.
- First step: prove the Railway mutation rebuilds the branch head (`release` in production, `main` in staging); no Vercel target (§13 Q16 C2).
- AC-8 reads `catalogue.placeholder_window`: register the key in TASK-219's registry here if TASK-297 has not; TASK-297 owns its one-way toggle.
- The admin home's two counters (§5.3 table: changes waiting to publish; items awaiting your review per granted locale) are built here.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): an SEO gate (sitemaps, hreflang, existence) and a deploy token.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).
- **Spec 044 clause (advisor fix 4, `specs/044-blog.md` §12):** Spec 044 §2.6 and AC-16: the indexable-removal refusal of spec 012b §2.3 and AC-8 reads its removal list through one predicate, `isRemovalRefused(url, context)`, that a later caller can extend without editing the guard. Spec 044 adds one exemption: a URL whose `blog_post` row has `status = 'unpublished'` with a non-null `unpublish_reason` and an `audit_log` row for `unpublishPost`. Until spec 044's migration exists the exemption matches nothing, and a fixture test pins that every other indexable removal is still refused.

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/lib/publish.ts`, `src/instrumentation.ts`, `/api/health`, the sitemap and hreflang builders, `src/jobs/`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b design (PR 296, escalation 3) does not draw the admin home's two counters. Build them in the existing `/admin` home's tile style with zero counts as the empty state, and say so in `## Copy approval

- founder (delegated), 2026-11-11: recorded by the orchestrator with record-approval-295.py under the founder's blanket approval of 2026-10-31, after reading the exact text it printed; spec 012b (TASK-295, TASK-296); the founder did not read this text: the 58 admin texts of spec 012b publishing (`admin.publish.*`, the admin home counters, the nav entry and the placeholder window flag), exactly as printed.

## Result` so the designer adds them.
- **2026-11-11 (implementer, self-review):** (1) **Railway target unproven.** The brief's first step (the Railway mutation rebuilds the tracked branch head) needs the founder's environment-scoped token; `railwayTarget()` (`environmentTriggersDeploy`, then the newest deployment read back) is untested against a live project, and reading "the newest deployment" right after the trigger can race. Prove it on staging with `PUBLISH_TARGET=railway` before relying on Publish. (2) `PUBLISH_TARGET` and `RAILWAY_PUBLISH_TOKEN` are read from `process.env` in `selectPublishTarget()` but are not yet in `.env.example` or `src/lib/env.schema.ts`: TASK-301 owns "the env and Railway declarations". (3) The database-mode build (`DATABASE_BUILD_URL` set) was not re-run here; the prices route's per-card reads are fixed and counted, but other route handlers that list products (the sitemaps are `force-dynamic`, so not at build time) still read per call at runtime. (4) T-05 (e2e: activate, 404, rebuild, 200) and the preview halves of T-09 and T-40 are owed to the e2e pass. (5) AC-8 with the window on allows every removal, not only `source = 'seed'` URLs; in production nothing is indexable while the window is on, so the two readings agree today. (6) Main's reds left as found: `catalog-barrel` (2), `admin-flags` (risk.gate confirmation), `fx-bundle-no-network`, `admin-permission-binding` (4), `flags` and `schema-notifications-ops` integration (stale flag and retention counts), `migrations-round-trip` (0045's `occasion_reminder_limit` function not listed), `check:no-db` (analytics), and others in the catalogue suites (46 failing on main in the set this PR ran, none new).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-11, migration number (implementer).** The work order assigned 0046 while main ended at 0044; the migrate runner refuses a gap. Resolved: TASK-352 merged 0045 and this branch is rebased on it; `pnpm db:check` exits 0.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer (TASK-295 and TASK-296 as one feature PR, #538): main's red `tests/unit/payments-copy.test.ts` fixed (stale key list); TASK-294 carry-forward 1 closed (`withCatalogReadScope`, one read per table per prices document); PR 449's publishing work ported onto main after 0044 (manifest, publish rules and store, jobs, `/admin/publish`, home counters, listings predicate, `urlsForTag`, `cache:warm`, the §5.4 table); new here: the manifest read at boot (`src/lib/existence-load.ts`), the light boot module (`src/lib/publish-boot.ts`), migration 0046 for the flag row, integration suite `publish-runtime`. Clean-env staging build green.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#538](https://github.com/itsahmeds/flowers-overseas/pull/538), with TASK-296. First commit: main's red `tests/unit/payments-copy.test.ts` (8 cases) listed only spec 013 §7's keys; the sixteen keys the pay step and pre-contract summary added since are now listed, Appendix A's wording still compared verbatim, no copy changed. TASK-294 carry-forward 1: a route handler has no React render scope, so `/api/prices/{locale}/{iso2}` read the whole `country_price` table once per card; `withCatalogReadScope()` (`src/modules/catalog/read-scope.ts`, AsyncLocalStorage) gives each prices document one scope, so a document reads each table once (`tests/unit/catalog-read-scope.test.ts`, 7 cases, counts reads; red with the scope removed). The database-mode build itself was not re-run (no seeded build database on this branch). Publishing (ported from PR 449 onto 0044, and adapted): the build writes `.next/existence-manifest.json` (3450 URLs on the clean-env staging build) and `/api/health` reports `existenceHash`; the boot loads it (`src/lib/existence-load.ts`), so no render path imports `node:fs`; `existsNow` and "database AND manifest" in the product, listing and corridor predicates that feed the resolver, sitemaps and hreflang; `src/lib/publish.ts` (railway, fake, none targets; the run state machine; one open run and ten a day; `isRemovalRefused` with spec 044's exemption seam); `src/lib/publish-store.ts`; the `catalogue.publish` and `cache.invalidate` jobs; boot verification (`src/lib/publish-boot.ts`, which reaches no page code) and the `dataAsOf` invalidation in the job; `/admin/publish` and its action (`catalogue.publish`: admin, content); the admin home's two counters in the existing tile style, zero counts as the empty state (for the designer: they are not drawn in the 012b artboards); the `catalogue.placeholder_window` flag, registered, with its row in migration `0046_placeholder_window` and rollback. Tests: unit `publish` (T-06, T-07, T-08, T-40 and the boot's import graph), `existence` (24, including the boot load), `command-tags`, `cache-warm`, `catalog-read-scope`, jobs and flags registries; integration `publish-runtime` (5, PG16: one run per Publish, second open and eleventh in a day refused with zero rows, single trigger, verification at boot, failed build code and report, `dataAsOf` tags). New admin texts: 58, `reviewed: false`, `.claude/state/record-approval-295.py` passes `--check`.
