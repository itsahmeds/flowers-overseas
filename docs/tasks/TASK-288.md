# TASK-288 — Spec 043 header in context

Row: `TASKS.md` → TASK-288. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 043 §5.3 A (the browse model, §13 Q1 answered A) and §12 task 1. Founder approval 2026-10-20, "all defaults, keep going".
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-6; tests T-01 to T-04 and T-06. `destinationShopLinks()`, the per-route header slot (a matching page or catch-all for every route under `src/app/[locale]`), `site-links.ts` unchanged.
- No `headers()`, `cookies()` or `searchParams` read on a prerendered route; no `Vary`, no `Set-Cookie`; `budget:client-js` no larger than `main` on any route (AC-4).
- Waits for neither TASK-239 nor TASK-241 (§12 item 1, advisor fix).
- `docs/design/` artboards from PR 295 (spec 043): the header href tables in `country-shop-*`, `corridor-country-*` and `product-*` (the header itself is not redrawn: labels and look unchanged); each opens with a "Spec 043 · site clarity" entry and ends with a "Spec 043" band. Match them pixel for pixel.
- AC-20 (T-20) is the design PR's (§12 item 5, PR 295); this task matches the artboards.
- **Review class: review-only** under the Light rule (CLAUDE.md DoD 4): internal links, SEO markup and caching, no money or legal text; the reviewer may call the breaker, and that call binds.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`; the founder records approved copy.

## Read

- `specs/043-site-clarity.md`: `## 0. Index`, then §5.3, §7, §9 and §10 for the ACs below
- `docs/codebase-map.md`
- `src/modules/ui` header and phone Menu, `src/config/site-links.ts`, the category and occasion hub destination lists

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** the spec 043 review (PR 292, nit 2) found the §14 pointers in specs 004, 007 and 008 still saying "Status: draft ... binding when the founder approves", and `specs/README.md` listing "043 site clarity (draft)". If PR 292 has not fixed them when this task starts, set all four to approved in this PR.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-21 (frontend-implementer): `destinationShopLinks()` / `pageDestination()` in `src/modules/catalog/shop-nav.ts` over the hubs' own row rule (`hubDestinationHref()`, extracted from `linksFor()` in `listing.ts`, behaviour unchanged); the whole header moved into a new `@header` slot with a page for every route under `[locale]` (`route-header.tsx`), `@notice` deleted (its home/claim rule now lives in the slot). Unit: `catalog-destination-shop-links`, `header-slot`; main's out-of-context hrefs pinned in `tests/fixtures/header/out-of-context-hrefs.json` (captured at 3efcdc39). Next: e2e `header-in-context.spec.ts`, codebase map, gates, PR. Carry-forward on the spec 004/007/008 §14 status lines and `specs/README.md`: not done, the permission classifier refused the edit (it records an approval); left for the orchestrator.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
