# TASK-316 — Spec 008 occasion hubs filled, part a: tags, floor test, fixtures

Row: `TASKS.md` → TASK-316. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 008 §14 A-founder-2026-10-21c ("every live occasion hub is complete"), approved 2026-10-21, founder "occasions ok" (every Q-21c default). Merges after PR 313 (the amendment).
- **ACs owned:** AC-70, AC-71, AC-72, AC-73; tests T-70, T-71, T-72, T-73, T-78 (the visual run, shared with TASK-317).
- **Review class: review-only** (tags, tests, fixtures; no money, dates or legal text). If this ships as one feature PR with TASK-317, the PR carries the breaker for TASK-317's part (dates).
- May ship as one feature PR with TASK-317 and, when Q-21c-3 allows, TASK-318: one branch carrying the first task id, the description naming every id it closes, each row given the PR link.
- Appendix A of the amendment is the list; it is the amendment's decision, not the implementer's. 74 new tags on 46 products. Tag in `src/config/catalogue/products.data.ts` (ADR-0017), then `pnpm seed:project`; never hand-edit `seed/data/products.json`.
- The one constant is `PRODUCT_COUNT_FLOOR` (value 6, `src/modules/catalog/listing.ts`); the floor test reads the hub set from the build's existence function, never a typed list.
- No new message key (copy headroom is zero). No migration, no new product, price, photograph or category.
- `tests/fixtures/shop/listing-urls.json` and every count pin are regenerated in the same PR; the description states the old and new totals from the build's listing summary line.

## Read

- `specs/008-country-shop-category-occasion-pages.md`: `## 0. Index`, then §14 A-founder-2026-10-21c (items 1 to 3, AC-70 to AC-73, T-70 to T-73, T-78, Appendix A)
- `docs/codebase-map.md`
- `src/config/catalogue/products.data.ts`, `seed/data/products.json`, `seed/data/media.json`, `src/modules/catalog/listing.ts`, `tests/fixtures/shop/listing-urls.json`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-21 (orchestrator, from the amendment): the asterisk in Appendix A marks a tag the product already has; leave it as it is. FO-PT-004 and FO-PT-006 have rejected primary images and are not newly tagged (FO-PT-006 keeps its three existing tags). `sant_jordi`, `muguet` and `all_saints` end at exactly 6, so the floor test is their only guard.

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
