# TASK-393 — The delivery countdown: `formatDuration()`, the next two `deliveryWindow()` slots as `data-fo-slots` on priced cards, the product page's price block and the prices document, and the island's "Order within {duration} for delivery tomorrow" shown only when true in both time zones

Row: `TASKS.md` → TASK-393. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-393`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 10: `formatDuration()` in `src/modules/i18n/format.ts` (`Intl.DurationFormat` short, else unit parts joined by `Intl.ListFormat`); at render the next two `deliveryWindow()` slots per priced product and country as `data-fo-slots` on country cards, the product page's price block and the prices document (TASK-391); the line `hidden` in the server HTML; the island shows `delivery.countdown.tomorrow` only when the first open slot is the country's tomorrow and the visitor's tomorrow with a minute left, rechecked by one 60 s timer, hidden at the cutoff. No `aria-live`, no red, no "hurry", no reset.
- Never shown while no country takes orders (AC-34 re-run: with today's data no element carries `data-fo-slots`). Class: keeps the breaker (dates and cutoffs).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 10, AC-109, AC-110
- `src/modules/geo/delivery/calendar.ts`, `src/modules/i18n/format.ts`
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
