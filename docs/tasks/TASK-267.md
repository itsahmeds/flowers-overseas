# TASK-267 — Spec 013 live switch-on: the restricted live key and live webhook endpoint verified on production, Radar Plus rules entered from the runbook, `payments.stripe` on in admin, and the first real paid order (`plan/09` Phase 1 acceptance 1)

Row: `TASKS.md` → TASK-267. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-267`; keep it current by editing this file, not the row.

## Binding

- No AC id: spec 013's ACs are proven in test mode; this task is §12's "real card payment with a live key" after the founder's blocking actions, and `plan/09` Phase 1 acceptance 1 (captured, routed, accepted, zero manual database edits).
- Founder actions first, in §12's order: account for the OÜ, restricted live key, live webhook endpoint with exactly §5.2's types, methods and Apple Pay domain, Radar Plus and the runbook rules, the Cloudflare WAF skip, the Stripe DPA in `docs/compliance/`, the settlement currency. No agent enters a key or signs in.
- Rollback is flags first (`payments.stripe` off returns new checkouts to `demo`, §12).
- **The founder's rulings in spec 013 §14 bind every line:** charge at once (`capture_method: 'automatic'`, no override, no hold for any method; A6 rows 1 and 15 are never written; no lapse job); no buyer surface says or implies partners, florists accepting, offers, re-routing or a held card (`RELAY_PATTERNS`/`RELAY_EXEMPT`/`relayMatches` already exist in `src/config/honesty.ts`: use them, keep no list of your own); no refund, failure or "if we cannot deliver" wording on a paid confirmation state; no edits after placement.
- **Class:** not review-only (`CLAUDE.md` DoD §4; spec 013 §12 "Review class"): money, order status, payments or webhooks. `/review` and `/break` both run.

## Read

- `specs/013-payments-order-state-machine.md`: `## 0. Index` first, then only the sections and ACs named here
- `docs/codebase-map.md` (where everything lives); `docs/tasks/TASK-202.md` (the order engine this spec calls)
- `specs/013-*` §12 (environments, rollback, founder actions, exit signal); `plan/09-roadmap.md` Phase 1 acceptance; `docs/runbooks/payments.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None yet._

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
