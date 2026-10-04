# TASK-209 — Phase 0 AC 4 end to end on staging: Poland, PDP, "Try a demo order", three steps, place, and the order on `/demo/vendor-inbox` and in `/admin/orders` within 5 s

Row: `TASKS.md` → TASK-209. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-209`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` AC-26, which §9 gives to whichever of the 010, 011 and 012 tasks merges last; ruling R6 (decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership") makes it this task, which waits for all three. Owns **spec 010 AC-26** and **spec 011 AC-26 (checkout half: an order placed through spec 010's demo checkout appears in an inbox already open in a browser within 5 seconds without a reload)**; tests **010 T-26, 011 T-26 (checkout half)**.
- **On staging:** Poland → PDP → "Try a demo order" → three steps → place → the order on `/demo/vendor-inbox` (signed in as a demo member) and on `/admin/orders` (signed in as admin) within 5 seconds, with no manual reload. Record the runs in the PR. Only shipped paths: no `place()` shortcut stands in for the checkout here.
- **Class:** not review-only (`CLAUDE.md` DoD §4): orders and the cross-spec journey that Phase 0 AC 4 rests on. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md` AC-26 and §12 "Exit signal"; `specs/011-for-florists-vendor-inbox.md` AC-26 and §12 "Environments"; `specs/012-admin-v0.md` AC-18; `plan/09` Phase 0 AC 4.
- Artboards: `docs/design/flows/buyer-journey.dc.html` (the mock-order step ending on the admin queue, spec 012 §5.3.1 item 10; round 2, on branch `docs/design-round2-2026-10-05` until it merges) and `docs/design/flows/florist-journey.dc.html`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** staging needs a demo member (`pnpm florists:demo-member add`, TASK-214) and an admin grant (`pnpm admin:grant`, TASK-217), behind the staging basic-auth gate.

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
