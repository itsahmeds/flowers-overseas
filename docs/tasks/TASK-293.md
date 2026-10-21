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

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21: migration `0019_review_attestation` + rollback, `attest()` (`src/modules/i18n/db/ledger.ts`), the pure half (`attestation.ts`), `fo/no-direct-review-write`, `admin:grant --locale/--revoke-locale`, `pnpm attestations:import`, `seed/data/attestations.json` (171 photo approvals, 0 copy) and the seed replay, the retention handler; tests T-10–T-14, T-28 written. Draft PR 320. Next: run the touched suites (machine load permitting), mutation checks, gates, ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
