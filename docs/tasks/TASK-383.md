# TASK-383 — The mega menu: `megaMenuModel(locale, iso2 | null)` out of and in context, six native `<details name="fo-mega">` panels from `xl` (two rows `md` to `xl`), featured cards, `RECIPIENT_GROUPS`, Coming up across shop countries, the phone Menu accordions and the home's phone round links, the "Send flowers" pill and `DEMO_DESTINATION_ISO2` gone

Row: `TASKS.md` → TASK-383. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-383`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 5 (the mega menu and the header) and spec 043's pointer: `megaMenuModel(locale, iso2 | null)` from the existence functions, the taxonomy and the registry only (an entry whose page does not exist is not drawn); hub entries plain links, shop entries (colour, price, "All flowers", featured cards) chooser links with `rel="nofollow"`; in context every entry with a country page links it, others are absent, featured products are that country's at its exact price (spec 043 AC-50).
- Native `<details name="fo-mega">`, closed in the server HTML, panel inside the header frame (no shift), panel images lazy at most 384 px and 25,600 B, header plus Menu at most 6,144 B Brotli. The phone Menu: the selector first (TASK-384), then six accordions, no images. The home's phone round links (item 4) are drawn on the chrome boards and owned here (AC-104).
- Spec 043 AC-2 and AC-3 were rewritten in place; their pinned tables (T-01 to T-03, T-06) are regenerated from the model. AC-6 is met by the menu linking every hub out of context (closes TASK-288's escalation of the 20 unlinked category hubs).
- Removes `DEMO_DESTINATION_ISO2` from `src/config/site-links.ts` and the "Send flowers" pill (Q-24d). The Basket link slot is TASK-349's; keep its place at the row's end.
- Class: keeps the breaker (in-context featured prices).
- Merges after TASK-385 (every chooser href answers 200) and TASK-382 (featured cards render the core range).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 5, "Rendering", "Core Web Vitals", AC-99 to AC-104
- `specs/043-site-clarity.md` AC-2, AC-3, AC-6 and its A-founder-2026-10-24a pointer (AC-50)
- `docs/design/wireframes/chrome-desktop.dc.html`, `chrome-mobile.dc.html`, the "Commerce structure" group of `docs/design/system/components.dc.html`
- `docs/tasks/TASK-288.md` (the header slot this builds on)
- `docs/codebase-map.md`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.
- **From `/plan-tasks` (orchestrator, 2026-10-24), board escalations of PR 372:** the For whom label for "a loved one" fails the voice scan (it is a `[slot]`; use only the spec's `nav.mega.recipient.*` keys); the Destinations panel's "Ordering open" group keys on `deliveryDatesOpen`, never on a status string.

## Escalations

- **2026-10-24, the colour shape** (`open`): see TASK-381; colour entries use the colour's category hub key where one exists, else the shop root, as the spec says.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
