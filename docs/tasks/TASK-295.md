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

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the 012b design (PR 296, escalation 3) does not draw the admin home's two counters. Build them in the existing `/admin` home's tile style with zero counts as the empty state, and say so in `
- 2026-11-02 CMS2 finisher: the admin home shows the two counters (changes waiting to publish, for `catalogue.publish`; per granted locale awaiting review, with photos for a media reviewer; zeros are the empty state, in the existing `AdminCounter` tile); `/admin/publish` bound to `catalogue.publish`; unit tests for `src/lib/existence.ts` and the diff; the resolver half of AC-5 for listings and corridors under test.

## Result` so the designer adds them.
- **2026-11-02 (CMS2 finisher):** the admin home's two counters are built in the existing `AdminCounter` tile style (no artboard draws them, `/plan-tasks` carry-forward): the designer adds them to `docs/design/`. `publishHomeCounts` has no integration test of its own (its reads are the publish page's diff and two counts); T-05 (e2e, local build) and T-40's preview half are CI's and the preview's. The Railway mutation (first step of the brief) is untested against a live Railway project: `PUBLISH_TARGET` and `RAILWAY_PUBLISH_TOKEN` are not set anywhere yet.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

In PR [#449](https://github.com/itsahmeds/flowers-overseas/pull/449). The existence manifest (`src/lib/existence.ts`, written by `scripts/existence-manifest.ts` after `next build`, `existenceHash` on `/api/health`); "database AND manifest" in `productPageExists`, `listingExists`, `listingPages` and `corridorPageExists`, so the resolver, sitemaps and hreflang read it; `src/lib/publish.ts` (Railway, fake, none targets; the run state machine; one open run and ten a day; the indexable-removal refusal through `isRemovalRefused` with spec 044's exemption seam; boot verification and the `dataAsOf` invalidation), `src/lib/publish-store.ts`, `src/lib/publish-runtime.ts`, the `catalogue.publish` and `cache.invalidate` jobs, `/admin/publish` and its action, the admin home's two counters, the `catalogue.placeholder_window` flag. Tests: unit `publish` (T-06, T-07, T-08, T-40: 17 cases), `existence` (21 cases: hash, public paths, manifest schema, the running manifest, the diff, the resolver and grid halves), `admin-permission-binding` (the page and action 403 for ops and finance), jobs and flags registries; integration AC-6's one-open-run index. Every AC-carrying assertion was mutated red (PR self-review).
