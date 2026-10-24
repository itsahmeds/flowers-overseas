# TASK-394 — Trust points, option 2: `TRUST_CLAIMS`, `deliveryPhotoRequired()` over the transition table, the live-Stripe payment predicate with its tag purge, the three points directly under "Continue" on the product page and the names-only row in the home's hero card, AC-15's three-key exemption and spec 009 T-22's scan change

Row: `TASKS.md` → TASK-394. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-394`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 11, option 2 (founder "2"): on the product page one `<ul>` directly after "Continue" (in the not-open state after the state line), items in order: the fresh-flower promise (`nav.utility.guarantee` linking the guarantee page only where `infoPageExists`, else plain text / `trust.promise.line`), the delivery photo (`home.proof.photo.title` / `.body`), "Secure payment" (`trust.payment.name` / `footer.payment.processor`); on the home the names only (`trust.photo.short`) as one row inside the hero card under the picker's submit and remember line.
- `TRUST_CLAIMS` predicates evaluated at render: `deliveryPhotoRequired()` from the order transition table (never a constant); payment only with `payments.stripe` on and live Stripe mode (never test mode, never with only Mollie), and turning the flag off purges the tags of every page carrying the bar. A false predicate leaves no gap. No review place, no logos, no florist or partner language, no script, no image request.
- AC-15's DOM and grep checks exempt exactly `home.proof.photo.title`, `home.proof.photo.body` and `trust.photo.short` while the predicate holds; spec 009 T-22 drops its delivery-photo marker.
- Spec 011 pointer: the photo claim never renders until spec 011's photo step (TASK-215) is built and tested; if AC-116 (b)'s committed table already makes the predicate true before TASK-215, escalate rather than render.
- Copy approved by the founder 10-24 ("trust copy ok") for `trust.promise.line`, `trust.photo.short`, `trust.payment.name`; he still records the approval on the branch. Class: keeps the breaker (consumer claims, payments flag).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 11, AC-111, AC-114 to AC-116, AC-15
- `specs/009-product-page-date-picker.md` and `specs/011-for-florists-vendor-inbox.md` §14 A-founder-2026-10-24a pointers
- `docs/design/wireframes/product-*`, `home-*` (option 2 drawn)
- `docs/codebase-map.md`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-24), AC-114 at 390:** the phone's fixed action bar cannot have the list as "Continue"'s next sibling within 24 px. **Orchestrator's design call (delegated):** on the phone the three points close the buy sheet (directly after its "Continue"), and the fixed bar carries no trust text. Prove AC-114's other clauses as written.
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
