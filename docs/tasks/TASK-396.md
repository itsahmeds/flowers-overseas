# TASK-396 — Coverage and go-live: `/admin/coverage` (core range first, florist count per product and country, warning under 2, the hidden note at 0, waitlist counts), `goLivePreflight`'s "Core range in {country}" item with the audited override, `coreRank` and `sortWeight` editable in the admin

Row: `TASKS.md` → TASK-396. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-396`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 12 and the spec 012b pointer: `/admin/coverage` (`catalogue.read`, 403 without), rows the core range in rank order then every other active product, columns the shop countries and every country with an active florist, each cell the count of active linked florists; a core cell under `CORE_MIN_FLORISTS` carries the warning (text and icon), and at 0 in a shop country says the product is hidden from country-less pages; reads the same `coreRange()`; no personal data; the waitlist's confirmed counts per country (AC-86's admin clause, no addresses).
- `goLivePreflight` (TASK-300) gains "Core range in {country}": fails with any 0, warns with any 1, passes otherwise; the typed-code override is audited (Q-24i). `coreRank` (on the product page, TASK-297) and `sortWeight` (on the country page) editable under `catalogue.write`, audited, the list kept within 8 to 12. A publish that changes the shop set or the core list re-renders every country-less page.
- Class: keeps the breaker (a go-live gate, the audit trail).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 12, AC-113
- `specs/012b-cms.md` §14 A-founder-2026-10-24a pointer
- `docs/design/wireframes/admin-coverage-*`
- `docs/codebase-map.md`

## Carry-forwards

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
