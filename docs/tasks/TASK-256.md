# TASK-256 — Spec 013 staging proof: with Stripe test keys, a Payment Element created with `captureMethod: 'automatic'` and an adapter-created intent, the 3DS-challenge test card ends `succeeded` with `amount_received` equal to the order total (never `requires_capture`); re-record the contract fixtures against test mode

Row: `TASKS.md` → TASK-256. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-256`; keep it current by editing this file, not the row.

## Binding

- Owns **AC-38** (T-38). Spec 013 §12 task 2's early proof, split out because it is the only part of task 2 that needs a Stripe account.
- Re-record the contract fixtures TASK-255 built from Stripe's OpenAPI fixtures against test mode, same pinned version directory; AC-27's PII scan still passes.
- Run on staging only with test keys; never a live key outside `production` (AC-10).
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §9 AC-38, §12 founder actions, §13 Q1; `docs/tasks/TASK-255.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-19 (`/plan-tasks`, to the founder; `open`). Spec 013 AC-38 says this proof "runs before any lifecycle task starts", and it needs the Stripe test keys that wait on the founder's account. TASK-257 and TASK-258 are `blocked` on that sentence. Recommended: let them build on `FakePaymentProvider` now and require this proof before their PR merges, since the risk it retires (a 3DS card charged at once with a deferred intent) is Stripe's documented behaviour.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
