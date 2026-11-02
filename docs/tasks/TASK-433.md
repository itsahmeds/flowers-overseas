# TASK-433 — Copy records for the florist work: the 79 English texts PRs 451, 452, 453 and 454 added (florist inbox, florist actions, application form and alert, florist emails and WhatsApp lines) recorded reviewed under the founder's delegation, the pinned review queue in `i18n-messages-schema.test.ts` brought in step, `en` back under the 5 % unreviewed share

Row: `TASKS.md` → TASK-433. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-433`; keep it current by editing this file, not the row.

## Binding

- Spec 003 §14 A-founder-2026-10-31a: the orchestrator records exact-text copy approval under the
  founder's delegation; `reviewedBy` starts with `founder (delegated)` and says the founder did not
  read the text; the record commit carries the `Co-Authored-By` line. The 5 % share (AC-24) and
  `de`/`pl` staying unreviewed do not change.
- Dispatch of 2026-11-02: record only the `en` keys PRs 451, 452, 453 and 454 added; refuse any text
  with an em or en dash, and buyer-facing text naming relay, partners or florists accepting; keep
  each `sourceHash`; bring `AWAITING_FOUNDER_REVIEW` in step (the 13 `floristInbox.*` keys of PR 452
  were never queued: add, then remove); touch no other key (the two unused `nav.*` keys are separate).
- Only touch: `messages/en.meta.json`, `tests/unit/i18n-messages-schema.test.ts`, `TASKS.md`, this brief.

## Read

- `specs/003-i18n-foundation.md` §14 A-founder-2026-10-31a, §9 AC-24
- `.claude/state/record-approval-213.py` (the pattern)
- `messages/en.meta.json`, `tests/unit/i18n-messages-schema.test.ts`, `tests/unit/i18n-review.test.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-11-02: row and brief; the 13 `floristInbox.*` keys of PR 452 added to the pinned queue so it matches main.
- 2026-11-02: 79 `en` keys recorded under the delegation and dropped from the queue; i18n tests green.

## Result

79 English keys recorded reviewed under spec 003 A-founder-2026-10-31a, each
`sourceHash` kept: PR 451's 11 `floristInbox.page.*`, PR 452's 13 `floristInbox.*`, PR 453's 21
(`forFlorists.apply.error.*` and `emails.floristApplicationAlert.*`), PR 454's 34 (`emails.layout.*`,
`emails.florist.*`, `whatsapp.florist.*`). None has an em or en dash or an `en-gb` override; the one
"accept" (`emails.florist.offer.recipientLater`) is florist-only. `unreviewedShare("en")` 0.0635
(40/630) on main e24763822, 0.0429 (27/630) after; `en-gb` 0.0651 to 0.0444. `de`/`pl` untouched.
Not recorded: PR 454's 43 `emails.ops.*` keys in `messages/admin/en.meta.json`: the admin catalogue is
never counted in a public share (spec 012 §2 AC-7) and `admin-scans.test.ts` pins every admin key
`reviewed: false`, so recording them would change another spec's pin for no share effect. Tests:
`i18n-messages-schema`, `i18n-review`, `i18n-review-scope` 59/59; `pnpm typecheck` 0. No build slot.
