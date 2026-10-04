# TASK-208 — Spec 010 gates: the checkout e2e with JS on and off in `en-gb` and `pl`, axe in four locales, visual baselines per step desktop and mobile, the client-JS budget, the PII scan of URLs, logs and Sentry, and the Cloudflare bypass check on staging

Row: `TASKS.md` → TASK-208. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-208`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 8: the one gates task of spec 010, so the page tasks do not each run Lighthouse, axe and visual. Owns **AC-31, AC-34, AC-37, AC-38 (budget half), AC-39 (baseline half)**; tests **T-31, T-34, T-37, T-38 (budget half), T-39**.
- **Suites:** the checkout e2e with JS on and off in `en-gb` and `pl`; axe on each step, its error state and the confirmation in four locales; a keyboard-only demo order; computed 16 px inputs and 44 px targets; 200 % zoom at 390 px with no horizontal scroll; visual baselines for each step, its error state, the confirmation and the closed state, desktop and mobile, `en-gb` and `pl`; `pnpm budget:client-js` for the checkout route (islands at most 4 096 B Brotli, within the 131 072 B first load) and no request to `js.stripe.com`.
- **PII (AC-34):** across the journey in two locales no URL, captured log line or scrubbed Sentry event carries the token, an email, a name, a phone, an address line, a postcode, the card message or the signature; `step` is the only query parameter.
- **Cloudflare (AC-31):** on staging the three checkout paths answer `cf-cache-status` `BYPASS` or `DYNAMIC`, and a cached PDP answers `HIT` with no `Set-Cookie`.
- CI gains the checkout e2e, a11y, visual and budget suites as required checks. Take the build slot only for the new baselines, and say so in `## Result`.
- **The 5-second p95 (spec 010 §12 task 8; `/review 191` nit 5):** re-record it here from the real place-order submit on staging, 20 runs, in the PR. AC-25 stays TASK-202's, measured from `place()`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): CI gates and the PII scan. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §5.4; §8; §10; §11 (CI); §9 AC-31, AC-34, AC-37, AC-38, AC-39; §12 task 8.
- `specs/040-hosting-railway-cloudflare.md` §5.4 (the cache rules); the baselines follow `docs/design/wireframes/checkout-{desktop,mobile}.dc.html` and `docs/design/wireframes/confirmation-{desktop,mobile}.dc.html` (PR 189; `docs/design/audits/2026-10-05-round-2.md`), as completed by the spec 010 design pass.
- `docs/codebase-map.md` (the e2e, visual and a11y layers under `tests/`).

## Carry-forwards

One dated bullet per `/review`, newest last.

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
