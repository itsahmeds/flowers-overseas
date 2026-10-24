# TASK-386 — The home's first screen and "Our selection": H1, promise, the inline picker with the remember line, the state line, `shop.hub.noMoney` once, the hero photo at most 45 % of the first viewport, the whole core range as country-less cards with "How we sort" and "See all", the sentence picker, `TrendingRow` and the home's Poland link removed

Row: `TASKS.md` → TASK-386. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-386`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 4.1 to 4.3 and the dedupe-free first part of the home: the header, then H1, one promise line, the inline picker (the chooser's form with an empty `next`, `PICKER_CHIPS` buttons, the search field, submit, remember line), spec 043 AC-8's state line while nothing is open and `shop.hub.noMoney` once. Hero at most 45 % of the first viewport at 1440 × 900; below `md` never above the first product. One `priority` image per viewport class with non-overlapping preload `media`.
- "Our selection" under `home.trending.heading` in "Our order" (rank order while every band is 0), "How we sort" closed, `shop.seeAll` to the chooser. **Orchestrator's design call (delegated, 2026-10-24): the section shows all 10 core products** (the boards' "Popular choices" holds the whole core range), so AC-95 holds from this section alone; the spec's "first 8" reads as the whole range while the list has 10 or fewer.
- Builds the country-less card markup (photo or placeholder, name, `shop.price.choose` in the reserved price box, `shop.cta.chooseCountry`, one chooser link `next=product/{slug}`), which TASK-388 and TASK-389 reuse.
- Removes the sentence picker and `TrendingRow`, and the home's shop link from `DEMO_DESTINATION_ISO2` (`src/app/[locale]/page.tsx`); TASK-326's listbox lapses with the sentence (Q-24c). Trust row slot under the remember line is TASK-394's.
- Same agent and feature PR as TASK-387. Class: keeps the breaker (price-display text). Lighthouse: this PR touches `/en` and `/en-gb`, so the LCP flake cannot be pleaded; show CI medians. Merges after TASK-382.

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 2, 4, 8, AC-92, AC-94, AC-95
- `docs/design/wireframes/home-desktop.dc.html`, `home-mobile.dc.html`
- `src/app/[locale]/page.tsx`, `src/modules/ui/home/`
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
