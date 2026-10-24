# TASK-398 — No country in code, click targets and copy: the source scan for destination ISO and country-name literals, the new-country fixture build with no `src/` change, the activation counts from the home to a product page and checkout, and the copy key-set diff with the founder's approvals

Row: `TASKS.md` → TASK-398. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-398`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- AC-73: the source scan over `src/` (excluding registry data, `messages/`, generated files and tests) finds no destination ISO literal and no country-name literal; `DEMO_DESTINATION_ISO2` and `DATED_DESTINATION` exist nowhere; a fixture registry adding a new shop country with prices and florists shows it in the build, the picker, the chooser and the Destinations panel with no `src/` change. Spec 045's default search destination is in scope only if spec 045 is published by then.
- AC-108: activation counts on a first visit and with `fo_dest` (open fixture, CI build, payment mocked): card then country to a priced product page; one activation to checkout step 1; at most 7 to payment at 390. Needs the basket and checkout (TASK-349, spec 010); if the counts fail, the founder decides (item 9).
- AC-112: `messages/en.json` against `main` gains exactly the rendered keys and loses exactly the listed ones; every new key outside `email` is founder-reviewed at the head.
- Class: review-only (scans and counts).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 9, 13, "i18n and copy", AC-73, AC-108, AC-112
- `docs/codebase-map.md`

## Carry-forwards

_None recorded._

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
