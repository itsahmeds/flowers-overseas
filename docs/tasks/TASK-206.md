# TASK-206 — Spec 010 confirmation, demo honesty and the product-page entry: `/{locale}/checkout/done`, the demo banner, inline privacy notice and "Use sample details" on every step, the demo place label, and the PDP's "Try a demo order" submit (the spec 009 amendment of §5.3)

Row: `TASKS.md` → TASK-206. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-206`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 6 (page half). Owns **AC-5, AC-29, AC-33**; tests **T-05, T-29, T-33**.
- **Confirmation (§2):** `/{locale}/checkout/done`, `no-store`, `noindex`, read from the draft cookie (no token in the URL): the `FO-XXXX-XXXX` reference derived from the order id, the demo statement, the recipient recap, the date, the card and the total; without a valid cookie, or for a draft with no order, "This confirmation is no longer available" with no order data and status 200.
- **Demo honesty on every step (AC-33):** the non-dismissible banner first in `<main>` on every step and on the confirmation; step 1's inline privacy notice (spec 041's `company.controller` line, purpose, retention of 24 hours where `APP_ENV = production` and 7 days otherwise, contact); "Use sample details" filling `checkout-samples.ts`; the demo place label; no pre-contract block, no withdrawal sentence and no terms link in `demo`. "In the real service" prefixes what happens next; florists in the present tense; the card is printed; no number of days of freshness.
- **The PDP entry (the spec 009 amendment, §5.3):** in `preview` with a demo-capable deployment (`checkoutEntryFor()`), the price summary keeps its sentence and gains one "Try a demo order" submit inside the existing form, `formaction` = the start route, `formmethod="post"`; `live` reads the continue label with the total; `unavailable` has no control. No new island, no new link, no `Set-Cookie`, no `Vary`, byte-identical HTML with and without `fo_checkout`, and still no `Product` or `Offer`. Spec 009's PDP budgets stay green.
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **No em dash in copy** (founder, 2026-10-05: "approve the wording just no em dash"; ruling R9 of the decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"). Where a spec string carries one, ship it with a full stop or a comma in its place, assert the message key and the substituted text, and list each changed string in the PR for the founder.
- **Review flags.** An `en` key is `reviewed: true` only with a `reviewedBy` naming the founder's batch approval of the spec's Appendix A; an agent never marks copy reviewed. Until that approval is recorded in the decisions log or the PR thread, the keys ship `reviewed: false`. `de` and `pl` are drafted by `pnpm i18n:draft` (spec 003 §14 A15) and stay `reviewed: false`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): compliance text (the Art. 13 notice, the demo statements), the PDP's cached HTML and structured data. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 (the entry, "Confirmation", "Compliance and honesty in the demo"); §5.3; §5.4 (the PDP stays ISR); §6 (schema types); §8; §9 AC-5, AC-29, AC-33; §12 artboards 2–4.
- `specs/009-product-page-date-picker.md` §5.3, §6, §13 Q7; spec 041's `company.controller` line.
- Artboards (merged in PR 189; `docs/design/audits/2026-10-05-round-2.md`): `docs/design/wireframes/confirmation-desktop.dc.html`, `docs/design/wireframes/confirmation-mobile.dc.html`, `docs/design/wireframes/product-desktop.dc.html`, `docs/design/wireframes/product-mobile.dc.html`, `docs/design/flows/buyer-journey.dc.html`.
- `docs/codebase-map.md`; the PDP price summary built by TASK-179.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the round-2 confirmation and product artboards merged in PR 189. Same frontend agent as TASK-201 and TASK-204.
- **From `/plan-tasks` (2026-10-05, after PR 189 merged):** the merged round-2 `checkout-*`, `confirmation-*` and `product-*` boards (`docs/design/audits/2026-10-05-round-2.md`) draw the round-2 layout (segmented steps, the form as a white letter, the recap) and a demo guard band reading "This is a demonstration. No order is placed and no card is charged.", but carry none of spec 010 Appendix A's state strings: no "Use sample details", inline privacy notice, demo calendar heading, price-changed, date-gone, daily-cap, closed or expired state, "Place demo order", demo confirmation or "no longer available"; the product board's preview state draws the "Ordering is not open yet" status pill, not "Try a demo order" (checked by a text search of the merged files). Those states need a spec 010 design pass (`/design 010`, spec 010 §12's artboard list) merged before this task is dispatched (`CLAUDE.md`: no page is built from a description alone). The guard band's wording differs from Appendix A's banner and goes to the founder with that pass.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05, em dash in AC-33's place label ("Place demo order — nothing is charged"):** to the founder through the PR (ruling R9). Default applied until answered: "Place demo order. Nothing is charged.". `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
