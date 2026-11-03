# TASK-436 — Copy records so English is indexable again: the English texts merged since TASK-433 that are still `reviewed: false` and counted (58 after TASK-333's record; `en` share 8.8 %, `en-gb` 8.9 %, both not indexable), plus the review queue pin for `emails.floristPayoutStatement.*`, recorded under the founder's delegation; `en` and `en-gb` back under 5 %

Row: `TASKS.md` → TASK-436. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-436`; keep it current by editing this file, not the row.

## Binding

- Spec 003 §14 A-founder-2026-10-31a: the orchestrator records exact-text copy approval under the
  founder's delegation; `reviewedBy` starts with `founder (delegated)` and says the founder did not
  read the text. The 5 % share (AC-24) and `de`/`pl` staying unreviewed do not change.
- Write `.claude/state/record-approval-436.py` (pattern: `record-approval-333.py`) with `--check`
  listing every text; the orchestrator reads and runs it. Refuse any text with an em or en dash,
  and buyer-facing text naming relay, partners or florists accepting: list those for a copy fix.
- Bring `AWAITING_FOUNDER_REVIEW` in `tests/unit/i18n-messages-schema.test.ts` in step (the
  `emails.floristPayoutStatement.*` keys of PR 475 were never queued). Regenerate the SEO fixtures
  the record changes and keep `tests/unit/sitemap-fixtures.test.ts` green.
- Founder rules 2026-11-04: no CI, no reviewer agents, only your own test files.
- Only touch: `messages/en.meta.json` (and `en-gb` records if separate),
  `tests/unit/i18n-messages-schema.test.ts`, `tests/fixtures/seo/**`, `TASKS.md`, this brief.

## Read

- `docs/tasks/TASK-433.md` (the same job done once), `.claude/state/record-approval-333.py`
- `pnpm i18n:check --summary` (the share table and the unreviewed keys)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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

_Pending._
