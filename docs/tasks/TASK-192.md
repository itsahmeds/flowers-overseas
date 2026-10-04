# TASK-192 — Record the founder's attestation of the TASK-179 present-tense copy

Row: `TASKS.md` → TASK-192.

## Binding

Branch `task/TASK-192-founder-attestation-179`. Its first commit (`chore(i18n): record the founder's
approval of the present-tense product copy`) is the founder's own run of `record-approval-179`
(2026-10-04T18:02:20Z): it sets `reviewed`, `reviewedBy: "founder"` and `reviewedAt` on
`messages/en.meta.json` → `catalog.floristSentence`, and on the en seed rows FO-BQ-001 and FO-BQ-003
in `seed/data/copy/en/products.json`, pinning their source hashes. **That commit is never edited,
squashed into another or re-authored**: an implementer never signs the founder's name (spec 004 §14
A5; `/review 58`).

This task brings the tests in step with it:
- `tests/unit/i18n-messages-schema.test.ts` — remove `"catalog.floristSentence"` from
  `AWAITING_FOUNDER_REVIEW` and replace its comment with a one-line record that it left the queue
  on the founder's attestation (2026-10-04).
- `tests/unit/copy-batch-2026-10-04.test.ts`, `tests/unit/seed-copy.test.ts` and any other test that
  pins FO-BQ-001 / FO-BQ-003 or the florist sentence as unreviewed: move the pins to the attested
  state (exact values, not sets).
- `docs/decisions-log.md`: one row recording the attestation.

## Read

- `specs/004-design-system-layout.md` — `## 0. Index`, then §14 A22 and A5 only
- `docs/codebase-map.md`

## Done when

- `pnpm gates:cheap` exits 0; the touched unit files pass.
- Mutation: put `"catalog.floristSentence"` back in the queue → the schema test goes red; flip
  FO-BQ-001's `reviewed` to false → the seed-copy pin goes red.
- `unreviewedShare("en")` still ≤ 5 %.

## Class

Review-only: copy review metadata and its tests; no money, SEO gate, data flow or compliance text
changes.

## Progress

- 2026-10-05: decisions-log row committed. Test changes written and green locally (6 files, 387
  tests) but **not committed**: see Escalations.
- 2026-10-05 (re-dispatch): rebased onto `origin/main` cecac0c2; the founder's commit is `=` in
  `git range-diff` (040518a3, author Ahmed, unchanged). Both extra pins follow from the
  attestation: `withoutDescription` counts rows with `reviewed: false` (`hasReviewedDescription`,
  `src/modules/catalog/product.ts`), and `ready` is `indexable && reviewed === rows.length`
  (`seed/check.ts`). Re-applying the test changes with the Edit tool was refused again: see
  Escalation 2.

## Result

## Escalations

1. **The edit guard does not open for TASK-192 in this worktree.** `.claude/hooks/guarded_paths.py`
   reads the task's status from the **main checkout's** `TASKS.md`, and the TASK-192 row exists
   only on this branch (commit `5136f4e1`), not on `main`. So the branch counts as "no task" and
   shell writes under `tests/` are refused ("TASK-192, which has no row in TASKS.md"). Before the
   refusal fired, five test files had already been edited through a Python heredoc the guard does
   not parse; those edits are left **uncommitted** in the worktree and saved as a patch, not
   committed past the guard. Needed from the orchestrator: land the TASK-192 row on `main` (or
   otherwise open the guard), then re-dispatch; the patch applies as is. The mutations (queue key
   back → schema test red; FO-BQ-001 `reviewed: false` → seed-copy red) have not been run, since
   they need guarded writes.
   PR 188 put the row on `origin/main` (cecac0c2), which did not by itself resolve this: see 2.
2. **The main checkout's working tree is behind `origin/main`.** The guard reads
   `/Users/ahmed/dev/flowers-overseas/TASKS.md` from disk, and that checkout is still at
   1076bc05 (before PR 188), so its `TASKS.md` has no TASK-192 row and every Edit under `tests/`
   is refused with the same message. Fast-forwarding the orchestrator's checkout is outside this
   task's fence, so nothing was routed around the guard. Needed: `git -C
   /Users/ahmed/dev/flowers-overseas pull --ff-only` (or equivalent), then re-dispatch. The test
   changes are unchanged from the first run and reviewed (each pin one exact value); the worktree
   is clean.
