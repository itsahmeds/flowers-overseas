# TASK-387 — The home's lower sections: Shop by occasion as CSS-only radio tabs, Shop by price as three word links, Coming up over every shop country (`OccasionDates`' Poland constant deleted), the destinations block from data (`DestinationsGrid`'s Poland case gone), the dedupe rule, the example label once per grid and each section's `ItemList`

Row: `TASKS.md` → TASK-387. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-387`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 4.4 to 4.7: Shop by occasion as one native radio group with CSS `:has(:checked)` panels (no script), tabs from `HOME_OCCASION_TABS` where at least 2 core products carry the occasion, up to 4 cards per panel and a plain hub link; Shop by price as three word labels with no amount, chooser links `next=price/{band}`; Coming up over every shop country (`nextOccasions` per shop country, `Intl.ListFormat`, `home.comingUp.more`), `OccasionDates`' `DATED_DESTINATION` deleted; the destinations block from data (`DestinationsGrid`'s Poland case removed); short how-it-works; FAQ.
- The dedupe rule (unit, AC-98); the example label once per grid with its reviewed text unchanged; each section's `ItemList` equals its cards and carries no price (AC-107).
- Same agent and feature PR as TASK-386. Class: review-only (no amounts; presentation and `ItemList` markup).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 4, AC-96 to AC-98, AC-107
- `docs/design/wireframes/home-desktop.dc.html`, `home-mobile.dc.html`
- `src/modules/ui/home/OccasionDates.tsx`, `DestinationsGrid.tsx`
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
