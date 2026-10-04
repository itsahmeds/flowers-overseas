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

## Result

## Escalations
