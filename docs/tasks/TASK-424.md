# TASK-424: Sign-in and express gates: axe (zero serious or critical) and 44 px targets on every new account state and on checkout steps 2 and 3 (guest, signed in, with and without the provider row, the panel ready, refused and absent) in four locales, and the visual baselines, desktop and mobile, in `en-gb`, `pl` and `/ar-XB`

Row: `TASKS.md` → TASK-424. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-424`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** review-only (accessibility and baselines), unless the reviewer calls the breaker.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **The one gates task for the three amendments.** It takes the build slot (`.claude/bin/build-slot.sh acquire` ... `release <token>`, on success and on failure) for the visual baselines and runs them once; CI's `ci:full` run is the gate of record.
- **Spec 018 AC-74, axe, target and visual half.** Zero serious or critical axe violations on the signed-out account page with both buttons, the `confirm-email` and `provider-error` states, `account/details` with "Your emails" and "How you sign in", and both confirm-page states, in `en-gb` and `pl`; each provider button at least 44 px with its exact accessible name; baselines, desktop and mobile, in `en-gb`, `pl` and `/ar-XB`. The key halves are TASK-415's and TASK-416's.
- **Spec 013 AC-62, axe and visual half.** Step 3 with the panel ready, refused and absent, in four locales; baselines for those states in `en-gb`, `pl` and `/ar-XB`. The keys, focus and layout-shift half is TASK-422's.
- **Spec 010 AC-108, axe and visual half.** Step 2 and step 3 (guest, signed in, with and without the provider row) in four locales; baselines desktop and mobile in `en-gb`, `pl` and `/ar-XB`. The key half is TASK-418's.
- A defect found here becomes a new row; it is not fixed in this PR unless it is in a baseline file.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a AC-74
- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a AC-62
- `specs/010-checkout.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a AC-108
- `docs/codebase-map.md`
- `docs/runbooks/visual-baselines.md`

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
