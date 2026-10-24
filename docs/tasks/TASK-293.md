# TASK-293 — Spec 012b review ledger for catalogue text and photos

Row: `TASKS.md` → TASK-293. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 2. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-10, AC-11, AC-12, AC-13, AC-14, AC-28; tests T-10 to T-14, T-28.
- After TASK-218 (PR 289: `audit_log`, `withAdminContext`'s action) and TASK-217.
- Review stays the founder's own act: `attest()` is the only path to `reviewed = true` or `review_state = 'approved'` (ADR-0022 as proposed in Appendix B).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): a migration, review authority and retention.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).
- **Spec 044 clause (advisor fix 4, `specs/044-blog.md` §12):** Spec 044 §2.4 and AC-4: `review_attestation.subject_kind`'s check, `subjectHash()` and `attest()` are written so that spec 044's migration adds the kind `blog_post_revision` by replacing the check and registering one hash function and one locale lookup in `attest()`'s subject table, with no change to `attest()`'s body. `attest()` must also accept a per-kind hook run inside its transaction on an `approved` decision, which spec 044 uses to set `blog_post_revision.frozen_at`. A unit test registers a fake kind to prove both seams.

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/i18n`, `seed/data/`, `src/lib/auth/`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-21, to the orchestrator: AC-12's second half ("`isProductIndexable` is false in that locale, the page carries `noindex`, it leaves that locale's sitemap and the other locales' hreflang clusters; a new approval restores all three") cannot be observed in this task. `isProductIndexable()` still reads the static providers, whose `translationReviewed` term is the constant `PHASE_0_REVIEWED_COPY` (`src/modules/catalog/read.ts`); the database catalogue provider is TASK-070 (`todo`) and its selection is TASK-294's cutover. This PR delivers and proves the half the ledger owns: the hash changes for exactly the six parts (SQL and TypeScript agree), and `reviewState()` turns unreviewed (`edited`) on such a change and reviewed again on a new approval. Proposed: TASK-294 (whose AC-2 already says "with the ledger as the review source for product copy and photos") composes `reviewState()` into the `translationReviewed` term and carries T-12's noindex/sitemap/hreflang rows. **Open.**

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: migration `0019_review_attestation` + rollback, `attest()` (`src/modules/i18n/db/ledger.ts`), the pure half (`attestation.ts`), `fo/no-direct-review-write`, `admin:grant --locale/--revoke-locale`, `pnpm attestations:import`, `seed/data/attestations.json` (171 photo approvals, 0 copy) and the seed replay, the retention handler; tests T-10–T-14, T-28 written. Draft PR 320. Next: run the touched suites (machine load permitting), mutation checks, gates, ready.
- 2026-10-24 finisher (renumber): rebased onto PR 326's head `a4aa02a3` (main + 383 `0019`/`0020` + 384 `0021` + 326 `0022`), renumbered to `0023_review_attestation`, retention handlers and rows merged with 326's, snapshot regenerated; full integration (46 files, 518 tests) and all 364 unit/contract files green on a throwaway PG16.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 320. Migration `0023_review_attestation` (renumbered from `0019` on 2026-10-24) (+ rollback, round trip green): `reviewer_locale`, the append-only `review_attestation` ledger, `review_subject_hash()`, `review_write_guard()` on `product_translation` and `media_asset`, staff-only RLS, retention row `review_attestation` (1095 days). `attest()` (`src/modules/i18n/db/ledger.ts`, admin and import channels), the pure half (`src/modules/i18n/attestation.ts`), barrel `attest` / `requestChange` / `reviewState` / `subjectHash`; `fo/no-direct-review-write` on `src/`, `scripts/`, `seed/`, `db/`; `admin:grant --locale / --revoke-locale`; `pnpm attestations:import`; `seed/data/attestations.json` (171 photo approvals, 0 copy approvals in the files) replayed by `db:seed`; the `retention.sweep` handler; permission rows `translation.attest`, `media.review`. Tests: integration 26 new (`review-ledger` 17, `attestations-import` 4, `review-retention` 2, `admin-grant` +2, `seed-insert-only` +1); unit 19 new (`no-direct-review-write` 7, `review-attestation` 12) plus updated pins. Every AC assertion was watched red under a mutation (guard same-transaction clause, guard flag, append-only trigger, the SQL hash's alts, the locale/stale/name refusals, the lint rule's allow and SQL branches, the import's missing-name rule, retention's cutoff and n reuse, the seed replay, `--revoke-locale`). `pnpm gates:cheap`: typecheck, lint, format:check, i18n:check, check:no-db, codebase:map --check exit 0; tests 4 red on the first run (three pins updated, one `no-literal-disable` time limit under load 71), all four green on rerun. No expensive gate run locally. Handed on: AC-12's indexability half to TASK-294 (escalated above); to TASK-297 the "imported, not re-read" chip (`reviewState().importedNotReRead`) and the 403 on a `de` copy *edit*; to AC-9's task the review decision's tags (`attest()` returns none, the tag builders are the catalogue's); to TASK-294 a read path for the build role (it cannot read the ledger); to TASK-083 `toMediaAssetRow` must insert `pending` and let the replay approve.

**Renumber and rebase (finisher, 2026-10-24).** The orchestrator's migration order puts this
PR's ledger at **`0023_review_attestation`**, after PR 383 (`0019`, `0020`), PR 384 (`0021`) and
PR 326 (`0022`). A version gap fails `db:check` and the runner, so the branch is **stacked on PR
326's head `a4aa02a3`** and merges only after 383, 384 and 326; then
`git rebase --onto origin/main a4aa02a3` and re-fire `ci:full`. Conflicts merged by hand:
`src/jobs/retention.ts` (326's `partner_application`, `auth_session`, `auth_verification_token`
handlers beside this PR's `review_attestation`), `schema-notifications-ops.test.ts` (thirteen
retention rows), `migrations-round-trip.test.ts` (383's `purchase_total_check` beside the five
review functions), `db/schema/index.ts`, `tests/unit/db-migrate.test.ts` (pins `0023`). The
`db-check` snapshot is regenerated from a throwaway PG16 migrated to `0023` (the only drift was
the ledger's 38 objects; RLS 81 of 81).

**Self-review of the renumber.** Full integration project on that PG16: 46 files, 518 tests
green. `vitest --changed a4aa02a3` (unit and contract, two workers): 364 files, 10925 tests green.
typecheck, lint, format, i18n, no-db and map checks exit 0. Nothing in the ledger's logic changed;
the renumber touches file names, comments and the lists that pin them.
CI on `33c47970`: `test-integration` timed out (5 s default) in PR 383's
`checkout-draft-lines-migration.test.ts`, whose rollback to `0019` now walks `0023` to `0020`; that
case and `purchase-migration.test.ts`'s now allow 120 s (`RUNNER_TIMEOUT_MS`), both green locally.
