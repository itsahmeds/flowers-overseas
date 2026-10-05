# TASK-201 — Spec 010 checkout UI primitives, no database: the fourteen §5.3 components in `src/modules/ui/checkout/` with every state, `/dev/components`, `system/components.dc.html` kept in step, the card counter and on-blur validation islands within 4 096 B Brotli

Row: `TASKS.md` → TASK-201. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-201`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 2. Owns **AC-14 (component half: `ErrorSummary` takes focus and links to each field, messages tied by `aria-describedby`, values kept, no error by colour alone), AC-38 (island half: the card counter and preview island and the on-blur validation island total at most 4 096 B Brotli, make no network request, add no inline script), AC-39 (component half: `StickyTotalBar` with the total and the step's primary action at 390 px)**; tests **T-14 (component half), T-38 (island half)**. The e2e, budget run and baselines are TASK-204's and TASK-208's.
- **Scope (§5.3):** in `src/modules/ui/checkout/`: `TextField` (default, focus, error, disabled, hint, warning), `SelectField`, `RadioChipGroup`, `TextAreaWithCounter`, `ErrorSummary`, `StepProgress` (`<ol>`, `aria-current="step"`), `OrderSummaryPanel`, `StickyTotalBar`, `DemoBanner` (non-dismissible), `PriceChangedNotice`, `InlinePrivacyNotice`, `SampleDetailsButton`, `PlaceOrderButton` (pending label through `useFormStatus`), `ConfirmationRecap`. `PreContractBlock` is spec 013's. The date grid reuses spec 009's `DeliveryDatePicker` and `DateChip` unchanged, with a `demo` label slot. Every state in `/dev/components`.
- **Form quality (§5.3):** `autocomplete` per field, `inputmode="tel"` and `"numeric"` where §5.3 says, inputs at least 16 px, tap targets at least 44 px, validation on submit always and on blur only with the island, values never cleared, no CAPTCHA. Logical CSS only, no literal strings, amounts only through `formatMoney`, names and the card inside `<bdi>`.
- **No database and no data fetching:** components take view models. No Stripe.js (spec 013).
- **Design.** `docs/design/` is the source of truth: match the artboards named under Read pixel for pixel, and keep `system/components.dc.html` in step with `src/modules/ui` in the same PR.
- **No em dash in copy** (founder, 2026-10-05: "approve the wording just no em dash"; ruling R9 of the decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"). Where a spec string carries one, ship it with a full stop or a comma in its place, assert the message key and the substituted text, and list each changed string in the PR for the founder.
- **Class:** not review-only (`CLAUDE.md` DoD §4): price display (the summary panel and the price-changed notice), the privacy notice at collection, and a client-JS budget gate. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §5.3 (all); §5.4 (client JavaScript); §8 (accessibility, price display); §9 AC-14, AC-38, AC-39; §12 task 2 and the artboard list (item 5).
- Artboards (merged in PR 189; `docs/design/audits/2026-10-05-round-2.md`): `docs/design/system/components.dc.html`, `docs/design/wireframes/checkout-desktop.dc.html`, `docs/design/wireframes/checkout-mobile.dc.html`.
- `docs/codebase-map.md`; `src/modules/ui` (existing `Button`, `Price`, the spec 009 date picker); `pnpm budget:client-js`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** the round-2 `components` and `checkout-*` artboards merged in PR 189. The v1 checkout files are superseded: they draw the express-wallet row, the marketing checkbox, "7-day freshness guarantee", "Handwritten card" and payment tiles, which spec 010 §12 removes.
- **From `/plan-tasks` (2026-10-05):** one frontend agent takes TASK-201, TASK-204 and TASK-206 in sequence: they share `src/modules/ui/checkout/` and the checkout view model.
- **From `/plan-tasks` (2026-10-05, after PR 189 merged):** the merged round-2 `checkout-*`, `confirmation-*` and `product-*` boards (`docs/design/audits/2026-10-05-round-2.md`) draw the round-2 layout (segmented steps, the form as a white letter, the recap) and a demo guard band reading "This is a demonstration. No order is placed and no card is charged.", but carry none of spec 010 Appendix A's state strings: no "Use sample details", inline privacy notice, demo calendar heading, price-changed, date-gone, daily-cap, closed or expired state, "Place demo order", demo confirmation or "no longer available"; the product board's preview state draws the "Ordering is not open yet" status pill, not "Try a demo order" (checked by a text search of the merged files). Those states need a spec 010 design pass (`/design 010`, spec 010 §12's artboard list) merged before this task is dispatched (`CLAUDE.md`: no page is built from a description alone). The guard band's wording differs from Appendix A's banner and goes to the founder with that pass.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-05: read the brief, spec 010 §5.3/§5.4/§7/§8, the round-2 + spec 010 boards and spec 003 A17 (PR 204). Design choice: the components take resolved copy as props and name no message key, because A17 check 11 refuses `checkout.*` keys read from `src/modules/ui/**`; the gallery's `checkout.tsx` resolves them. Next: components, islands, budget test.
- 2026-10-05: done and pushed: the 14 components in `src/modules/ui/checkout/` (sub-barrel, imported by path), 66 `en` keys (`checkout.*`, `confirmation.*`, all `reviewed: false`, de/pl drafted), the gallery's "Checkout" section (`checkout.tsx`, `checkout-fixtures.ts`, `CheckoutErrorDemo.tsx`), `system/components.dc.html` "Checkout" group, unit tests `checkout-ui-components.test.tsx` (55) and `checkout-ui-islands.test.ts` (24, budget under 2 KB Brotli of 4 096; zod-import, autoFocus, focus() and sticky-total mutations each watched red), e2e `checkout-ui.spec.ts` (not run locally; CI's). PR 206 draft.
- 2026-10-05: NEXT (gates:cheap red: format:check + 64 unit failures in 27 files). Triage: (1) mine: `url-pii.test.ts` flags the `?step=` literal in `src/app/(dev)/dev/components/checkout.tsx:134` (use `QUERY_KEYS` or a non-URL href); `checkout-config`, `tokens`, `i18n-messages-schema`, `i18n-pseudo`, `i18n-check`, `dev-os`, `seed-check` need reading; (2) expected until TASK-224 (PR 204) merges: `en` share 14.6 % makes `en` non-indexable, so the sitemap, alternates, review, listing and hub tests go red; rebase on TASK-224, add the `checkout`/`orderConfirmation` entries to `review-scope.ts` with `paths` = `src/app/(dev)/dev/components/checkout.tsx` + the checkout route, rerun. Then: run `pnpm format` on the diff, rebase, `gh pr ready`, `ci:full` + `visual:baselines` (the full-page `dev-components-desktop.png` grows), PR body with "Copy for the founder", `## Result`, row `in_review`. Carry-forwards: `Button` lacks `name`/`value`/`form` (local `styles.ts` copy); `DeliveryDatePicker` has no demo-legend slot (TASK-204, outside this fence); spec 041 controller line not shipped (gallery passes ""); non-local phone warning reads "a phone number in {country}" where the board draws "a Polish number".

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
