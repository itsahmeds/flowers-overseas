# TASK-417: Export and erasure for provider links and added emails: `signInMethods` and `addedEmails` in the export, erasure of the user's `accounts`, pending link and claim rows, each added customer deleted or pseudonymised as the primary, a later sign-in with the same `sub` starting with no order

Row: `TASKS.md` → TASK-417. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-417`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Specs 018, 013 and 010, each amended by §14 A-founder-2026-10-25a, approved by the founder on 2026-10-25 in his words: "whatever option you suggest is the best one and the most professional and premium one, and how others do it, go with it." Spec PR 416 and design PR 417 are merged; build from the spec text and the artboards on `main`.
- **Self-review (founder 2026-10-22).** No reviewer or breaker agent runs. Put `## Self-review` in the PR: every owned AC at file:line with its test, the mutation that turned each AC assertion red (assert the one value, never the set of reachable values), and, for the class below, the awkward cases tried and their results. CI green on the head SHA; paste the `pnpm gates:cheap` block.
- **Class (DoD §4):** keeps the breaker: data flows and compliance (export and erasure). Awkward cases at least: erasure with and without orders on each added customer, a pending link keyed only by the email hash, a user whose primary is already redacted.
- Countries are data and nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). New keys `reviewed: false`, never `reviewed: true`; no em dash in any key, text or comment. Database work only on a throwaway local Postgres 16 (never `.env.local`); a migration is numbered after the last merged one when the task starts and ships with its `.down.sql`.
- **AC-72 (T-72).** The export (TASK-345's) gains `signInMethods` (`provider`, `providerAccountId`, `linkedAt`) and `addedEmails`. Erasure deletes the user's `accounts`, `auth_pending_link` (by identifier hash) and `buyer_email_claim` rows and treats each added customer exactly as the primary: deleted without orders, else pseudonymised. A later Google sign-in with the same `sub` creates a new account that lists no order.
- **AC-29 and AC-30, the A-founder-2026-10-25a extension only** (they are extended by AC-72); TASK-345 owns them as amended on 2026-10-22 and is not rewritten here: extend its export and erasure, keep its tests green.
- The RoPA wording of these flows is TASK-423's.

## Read

- `specs/018-tracking-account.md`: `## 0. Index` first, then §14 A-founder-2026-10-25a S.4, S.7, S.8 (export and erasure); C.9, C.16, AC-29, AC-30
- `docs/codebase-map.md`
- the privacy request module TASK-345 adds (`NNNN_privacy_requests`)

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
