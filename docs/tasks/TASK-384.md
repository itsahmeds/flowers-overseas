# TASK-384 — The header's "Sending to" selector and the menu's hover: summary in and out of context, its panel the chooser's form with the route's `next`, re-pricing on a change of country with the basket's lines kept, the deferred hover-intent, Esc and click-outside handler, the remembered country's label after paint

Row: `TASKS.md` → TASK-384. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-384`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Items 3 and 5: the selector's `<summary>` reads `nav.sendingTo` in context (the URL's country, server HTML) and `nav.sendingToChoose` elsewhere, fixed inline size with ellipsis; its panel is the chooser's GET form with `next` derived statically from the route. After paint on a country-less page with `fo_dest`, the island sets the remembered country's name with no layout shift.
- AC-88: from a product page, country category, country occasion and shop root in X, choosing Y lands on the same page in Y, else Y's shop root, else TASK-392's not-available page; a basket line for X keeps X's price and a Y line can be added beside it (spec 010 pointer). The basket clause is proven once TASK-349 merges; if it has not, carry that clause here and say so.
- AC-101: hover intent 150 ms, fine pointer only, close 300 ms after leaving, Esc returns focus to the summary, focus leaving or a click outside closes; no transition under reduced motion; axe zero serious or critical with a panel open.
- Same agent and feature PR as TASK-383. Class: keeps the breaker (re-pricing, a cookie read).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 3 and 5, AC-88, AC-93, AC-101
- `specs/010-checkout.md` §14 A-founder-2026-10-24a pointer
- `docs/design/wireframes/chrome-*`, `product-*` (the selector re-pricing state)
- `docs/codebase-map.md`

## Carry-forwards

- **Deferred island budget, shared:** TASK-384 (hover, selector label), TASK-385 (history replace), TASK-391 (fill, URL rule) and TASK-393 (countdown) together add at most 2,560 B Brotli to the existing deferred set, no new island on any route (spec 004 item "Rendering"). Print this PR's share and the running total; if it will not fit, drop the hover first (Q-24g), then stop and report.
- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

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
