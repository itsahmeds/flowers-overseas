# TASK-296 — Spec 012b publishing, part 2

Row: `TASKS.md` → TASK-296. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 4 (second half). Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-5 (listings and links half), AC-9; tests T-05 (that half), T-09.
- AC-9: builds the `{ result, tags }` mechanism and T-09 as one table-driven test over the §5.4 table for every command that exists; TASK-297 to TASK-300 each add their commands' rows to it.
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): an SEO gate and cache invalidation.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- the listing and internal-link builders, `urlsForTag`, `scripts/` `cache:warm`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-11 (implementer, self-review):** T-09's preview half (a price and a name edit in the edge HTML within 60 s) and T-05's e2e are owed to the e2e pass; the T-09 table's command rows arrive with TASK-297 to TASK-300.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer: built with TASK-295 in PR #538 (see its brief); PR 449's grid, search, `urlsForTag`, `cache:warm` and §5.4 table commits ported onto main.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#538](https://github.com/itsahmeds/flowers-overseas/pull/538), with TASK-295. The listings and links half of AC-5: `productPageAdmitted()` (`src/modules/catalog/listing.ts`) in `productsFor()` (shop root, country category and occasion, hubs per country), the category tiles and `catalogSearchSource().products`, a no-op without a manifest or inside `databaseOnly()`. `urlsForTag`/`pathsForTag` resolve `sitemap` and `country:{iso2}`. `pnpm cache:warm` (`scripts/cache-warm.ts`). AC-9: `src/lib/command-tags.ts` (`commandTags`, `commandOutcome`, `applyCommand`) and the table-driven T-09 (`tests/unit/command-tags.test.ts`); no catalogue, price, photo, review or country admin command exists on main yet, so the table's rows wait for TASK-297 to TASK-300 to call `applyCommand`. Tests: unit `command-tags`, `cache-warm`, `cache-cloudflare`, `cache-product-tags`, `existence` (grid and search cases).
