# TASK-276 — Record the founder's review of copy batch 5: the 79 English keys of `.claude/state/copy-batch-5.md` that are live on main marked reviewed by the founder's own `record-approval-batch5.py` run, the review-queue and test pins moved, the sitemap fixtures' lastmod regenerated

Row: `TASKS.md` → TASK-276. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-276`; keep it current by editing this file, not the row.

## Binding

- **Spec 003 §14 A17 clause 5:** copy is marked reviewed only by the founder's own act; no agent sets `reviewed: true`. Checkout keys are not counted in the unreviewed share, but they are not exempt from the founder's exact-text approval.
- **The approval:** the founder approved copy batch 5 in chat on 2026-10-19, verbatim "approve batch 5". The list is `.claude/state/copy-batch-5.md`: 80 lines live on main, plus PR 270's help-page keys.
- **Left out:** `occasionHub.dateUnknown`, which still contains an em dash and is rewritten before it is recorded. Also left out: every PR 270 key (`infoPages.*`, `footer.link.deliveryAndPayment`), which is not on main and is recorded after that PR merges. That leaves 79 keys.
- **The record:** the founder runs `.claude/state/record-approval-batch5.py` in the `task/TASK-276-copy-batch-5-record` worktree after reading the 79 printed texts. The script commits on its own, author Ahmed, with no Claude co-author line. No message value changes.
- **Class:** review-only (copy attestation and the test pins that read review state).

## Read

- `specs/003-i18n-foundation.md` §14 A17; `.claude/state/record-approval-batch5.py`; `.claude/state/copy-batch-5.md`.
- The model: TASK-253 and PR 260 (copy batch 4).

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

- 2026-10-19: row and brief added. Next: the record script in `.claude/state/`, tested on a throwaway clone only; then the founder runs it and the draft PR opens.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
