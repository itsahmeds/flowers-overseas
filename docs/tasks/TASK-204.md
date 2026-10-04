# TASK-204 — Spec 010 checkout page: `/{locale}/checkout` with the three steps, the demo, closed and expired states, the demo calendar, the summary panel and sticky bar, errors, JS-off, the `checkout` and `checkoutDone` page types in `modules/seo` and the `/*/checkout` robots disallow

Row: `TASKS.md` → TASK-204. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-204`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 5. Owns **AC-3, AC-7, AC-8 (render half: the destination's fields in `address-formats.ts` order with `autocomplete` and `inputmode`), AC-10 (render half: `<bdi>`, the preview labelled as printed), AC-12, AC-14 (page half), AC-19 (render half: in `demo` step 1 offers `deliveryWindow()`'s dates as if the demo florists were active, labelled as demo dates, with every surcharge; in `live` the PDP's date is preselected), AC-30, AC-32**; tests **T-03, T-07, T-08 (e2e half), T-10 (e2e half), T-12, T-14 (page half), T-19 (unit half), T-30, T-32**.
- **Scope:** `src/app/[locale]/(checkout)/checkout/page.tsx` (thin), the three steps on one URL, the `demo`, `closed` and expired-draft states, the demo calendar, the summary panel and the 390 px sticky bar, errors, JS-off. At most eight inputs per step at 390 px; `?step=` only selects a reachable step. Step 2 renders no marketing opt-in, no WhatsApp opt-in and no account or password field (§13 Q7).
- **SEO (§6):** `SeoPageType`s `checkout` and `checkoutDone` with a constant `noindex` rule in `src/modules/seo/indexability.ts` (no robots literal outside `modules/seo`); `X-Robots-Tag: noindex, nofollow` and the meta; no canonical, hreflang or JSON-LD; `/*/checkout` added to `DISALLOWED_PATHS` in `src/modules/seo/robots.ts`; no `<a href>` to a checkout URL on any indexable page. SSR `no-store`.
- **i18n (§7):** dates with weekday and month name, times with the zone named, money through `formatMoney`, `/ar-XB` with logical CSS and `<bdi>` around names, addresses and the card, plus its baselines (T-32).
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **No em dash in copy** (founder, 2026-10-05: "approve the wording just no em dash"; ruling R9 of the decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"). Where a spec string carries one, ship it with a full stop or a comma in its place, assert the message key and the substituted text, and list each changed string in the PR for the founder.
- **Review flags.** An `en` key is `reviewed: true` only with a `reviewedBy` naming the founder's batch approval of the spec's Appendix A; an agent never marks copy reviewed. Until that approval is recorded in the decisions log or the PR thread, the keys ship `reviewed: false`. `de` and `pl` are drafted by `pnpm i18n:draft` (spec 003 §14 A15) and stay `reviewed: false`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): an SEO gate (indexability and robots), price display, and personal data in forms. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 (the three steps, the date); §5.3; §5.4; §6; §7; §9 AC-3, AC-7, AC-8, AC-10, AC-12, AC-14, AC-19, AC-30, AC-32; §12 task 5 and the artboard list.
- Artboards (merged in PR 189; `docs/design/audits/2026-10-05-round-2.md`): `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`, `docs/design/flows/buyer-journey.dc.html` (steps 05 and 06).
- `docs/codebase-map.md`; `src/modules/seo/indexability.ts`, `src/modules/seo/robots.ts`; spec 009's `deliveryWindow()`; `docs/tasks/TASK-201.md`, `TASK-203.md`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the round-2 checkout artboards merged in PR 189. Same frontend agent as TASK-201 and TASK-206.
- **From `/plan-tasks` (2026-10-05, after PR 189 merged):** the merged round-2 `checkout-*`, `confirmation-*` and `product-*` boards (`docs/design/audits/2026-10-05-round-2.md`) draw the round-2 layout (segmented steps, the form as a white letter, the recap) and a demo guard band reading "This is a demonstration. No order is placed and no card is charged.", but carry none of spec 010 Appendix A's state strings: no "Use sample details", inline privacy notice, demo calendar heading, price-changed, date-gone, daily-cap, closed or expired state, "Place demo order", demo confirmation or "no longer available"; the product board's preview state draws the "Ordering is not open yet" status pill, not "Try a demo order" (checked by a text search of the merged files). Those states need a spec 010 design pass (`/design 010`, spec 010 §12's artboard list) merged before this task is dispatched (`CLAUDE.md`: no page is built from a description alone). The guard band's wording differs from Appendix A's banner and goes to the founder with that pass.

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
