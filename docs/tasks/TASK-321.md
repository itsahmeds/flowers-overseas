# TASK-321 — Spec 044 blog data and rules

Row: `TASKS.md` → TASK-321. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-321`; keep it current by editing this file, not the row.

## Binding

Spec 044 §12 slice A task 1. Founder approval 2026-10-21: "044 defaults" (every §13 default) and "blog ok" (Appendix A's ten labels); advisor fixes 1 to 5 of `docs/advice/2026-10-21-044-blog.md` applied. The spec is PR 312 and the design PR 319 (`docs/design-044-blog`); dispatch only after both are merged.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-17; tests T-01 to T-07 and T-17.
- Depends on TASK-293 (the ledger; its brief carries the seam clause this task relies on: a per-kind table in `attest()` and `subjectHash()`, plus a per-kind hook run inside `attest()`'s transaction that sets `blog_post_revision.frozen_at`), TASK-292 (`app_build`), TASK-294 (migration order: `NNNN_blog` follows `NNNN_catalogue_cms`) and TASK-218 (`audit_log`, `withAdminContext`).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a migration, review authority and a data flow (authors are personal data, spec 044 §8 flow 1).
- Migration numbered at implementation after the last one merged, with a hand-written `.down.sql` the round-trip test runs; integration tests on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production). No `float`, no `enum`, no extension.
- Review stays the founder's own act: only `attest()` writes an approval; the four triggers refuse every other path (§2.4).
- The honesty refinement is one named export, `PROSE_RELAY_CONTEXT`, beside `RELAY_PATTERNS` in `src/config/honesty.ts`, read only by the blog rule; `RELAY_PATTERNS` and spec 041's own scans are unchanged. The token-distinctness measure `corridor:check` uses is extracted into one shared function; `corridor:check`'s fixtures stay unchanged (spec 007).
- The 70 % distinctness rule also compares against the corridor guide text of each tagged country in the post's locale (advisor fix 3).
- Admin and rule-refusal strings go in `messages/admin/en.json` only and ship `reviewed: false` (the `admin` surface does not count toward spec 003 A17's share).
- Seed fixtures (one author, one published and one draft post, `source = 'seed'`) never reach production (`db:seed --insert-only`, spec 012b AC-1).

## Read

- `specs/044-blog.md`: `## 0. Index`, then §2.2 to §2.4, §2.6 (withdrawing an author), §5.1, §5.2, §8, §9 AC-1 to AC-7 and AC-17, §10 T-01 to T-07 and T-17
- `specs/012b-cms.md` §2.4 and §2.5 (the ledger and the validators), `docs/tasks/TASK-293.md`
- `docs/codebase-map.md`; `src/modules/geo/content/markdown.ts`, `src/config/honesty.ts`, `src/config/voice.ts`, `src/config/freshness-claim.ts`, `scripts/check-no-db.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.


- **From `/plan-tasks` (orchestrator, 2026-10-21):** add `src/modules/content/blog/db/` to `scripts/check-no-db.ts`'s allowed paths in this PR (the database provider lands here and `check:no-db` would go red otherwise); AC-21's check of it is verified again in TASK-325.
- **From `/plan-tasks` (orchestrator, 2026-10-21):** the `blog_author` table has no numbered public id in slice A. Public author pages at `/en/authors/{number}` and the numbered column are slice B, which has no task row yet; do not add them here.

- **From the implementer (backend-implementer, 2026-10-24), open in this PR:** the seed fixtures (one author, one published and one draft post, `source = 'seed'`, never written by `db:seed --insert-only`) are **not built**. The tables carry `source` and the commands accept an injected `runAdmin`, so the seed can drive `createAuthor`, `createPost`, `attest()` (import channel, which freezes) and `publishPost` through an `executorOf` runner. TASK-322's e2e needs them; build them first there or in a follow-up row.
- **For TASK-322 (public pages):** existence here is the database half only (`dbBlogProvider`); AND it with spec 012b's manifest (`existsNow`, TASK-295). Tag every `/en` and `/en-gb` blog document with `blog:en` (the post's content locale), because `publishChanges` and `unpublishPost` return exactly `blog:post:{id}`, `blog:{post locale}`, `sitemap` (AC-15). The T-07 built-HTML half (element allow-list inside the article) is the page's. `resolveBlogLink` and `siteBlogLinkTargets` are ready.
- **For TASK-322 / TASK-323:** after `reassignAuthor` on a live post the byline changes at once while the served revision's approval was for the old author id; per §6 the post should read as not reviewed (noindex) until the new draft is approved and `publishChanges` runs. The page's indexability term should compare the ledger head with `review_subject_hash()`.
- **For TASK-323 (admin):** `publishPost` reports `firstPublish`; requesting spec 012b's publish run (AC-15) is the action's. Permission checks (`blog.edit`, `blog.publish`, `blog.unpublish`, `blog.authors`) are the actions'. Rule messages live under `admin.blog.rule.*` (`blogRuleMessageKey(id)`), `reviewed: false`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-24, to the orchestrator (for the founder): AC-6 conflicts with spec 004 §14 A5.** AC-6 says "Flowers for your partner on her name day." saves. It passes `blog/relay` (the `PROSE_RELAY_CONTEXT` refinement works as specified), but §2.3 rule 5 also applies `bannedVoiceWordsIn`, whose list bans "partner" anywhere, and `src/config/voice.ts` allows no new exception without a spec amendment. Implemented as the stricter reading: the sentence is refused with `blog/voice` (not `blog/relay`). The founder either amends the voice rule for blog prose or changes AC-6's example. **open**
- **2026-10-24, recorded:** migration number is `0024`, not the `0025` the work order named: `db:check` requires contiguous versions and PR 307 adds no migration, so `0024` is the next free one on the stack (PR 383, 384, 326, 320). The brief's `NNNN_catalogue_cms` (TASK-294) has no migration yet; `0024_blog` reads nothing it adds. **closed**
- **2026-10-24, recorded:** spec §2.2 (advisor fix 2) names `own_name_confirmed_at`, which §5.1 item 1's column list omits. Added the column, the person-only confirmation (`blog_author_guard()`, `app.user_id` must be the author's user), the reset on a display-name change (`blog_author_follow_profile()` on `admin_profile`) and `BLOG_AUTHOR_NAME_UNCONFIRMED` in the publish guard. **closed (spec text followed)**

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24: worktree on `task/TASK-321-blog-data`, stacked on PR 320 (TASK-293's `attest()`), rebased onto `origin/main` 5adb1e0b. Migration `0024_blog` + rollback, Drizzle mirror, RLS map, db-check snapshot; `attest()`/`subjectHash()` learn `blog_post_revision`; lint rule guards `published_revision_id` and `frozen_at`; shared distinctness in `src/lib/distinctness.ts`; `PROSE_RELAY_CONTEXT`; competitor list moved to `src/config/competitors.ts`; blog module (schemas, markdown, rules, links, provider, db provider, commands); unit and integration suites green on a local PG16. Seed fixtures not started.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 394](https://github.com/itsahmeds/flowers-overseas/pull/394), stacked on PR 320. Migration `0024_blog` (five tables, the `blog_author_public` view, the hash, freeze, publish-guard and slug-lock triggers plus the draft rehash and the two author triggers, RLS for `app_web` and `app_build`, the audit trigger on all five, the widened ledger check) with a hand-written rollback that keeps blog ledger rows and restores the old check `NOT VALID`. `attest()` freezes an approved revision in its own transaction; `blogRevisionHash()` equals the trigger's hash. Rules `blog/*` (19 hard, 4 soft), the markdown subset, link targets, `dbBlogProvider`, and the commands `createPost`, `saveRevision`, `setTags`, `approveRevision`, `publishPost`, `publishChanges`, `unpublishPost`, `createAuthor`, `confirmOwnName`, `withdrawAuthor`, `reassignAuthor`. Tests: unit `blog-rules` 40, `blog-markdown` 10, `blog-hash` 14, `no-direct-review-write` +2, `rls-policies` +3; integration `blog` 19 (T-01 to T-05, T-17), plus updated pins in `build-role`, `audit-trail`, `migrations-round-trip`, `db-migrate`, `admin-scans`, `i18n-barrel`, `no-db-imports`. Not done: the seed fixtures (carry-forward above). Open: the AC-6 voice-word escalation.
