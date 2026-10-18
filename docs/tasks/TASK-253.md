# TASK-253 — Record the founder's review of copy batch 4: 28 English keys marked reviewed by the founder's own `record-approval-batch4.py` run, the review-queue and two test pins moved, the sitemap fixtures' lastmod regenerated

Row: `TASKS.md` → TASK-253. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-253`; keep it current by editing this file, not the row.

## Binding

- **Spec 003 §14 A17 clause 5:** copy is marked reviewed only by the founder's own act; no agent sets `reviewed: true`.
- **The record:** the founder approved copy batch 4 in chat (2026-10-18, "approve..": `.claude/state/copy-batch-4-counted.md`, 30 lines minus the two em-dash keys `occasionHub.dateUnknown` and `shop.occasion.seoTitle`, which TASK-243 rewrites) and ran `.claude/state/record-approval-batch4.py` after reading the 28 printed texts. Commit `c3e4ce52`, author Ahmed, no Claude co-author line.
- **Effect:** en-gb unreviewed share 4.99% to 0.56%; en 4.81% to 0.37%. No message value changes.
- **Class:** review-only (copy attestation and the test pins that read review state).

## Read

- `specs/003-i18n-foundation.md` §14 A17; `.claude/state/record-approval-batch4.py`.

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

[PR 260](https://github.com/itsahmeds/flowers-overseas/pull/260), merged 2026-10-18: the founder's own `record-approval-batch4.py` run marked 28 English keys reviewed; en-gb's unreviewed share went from 4.99% to 0.56%.
