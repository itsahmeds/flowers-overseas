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

- 2026-10-22 (implementer, E-1, to the orchestrator in PR 323): AC-72 and T-72 ask that `ItemList` on each Appendix hub "has the same number of entries as the cards rendered". No listing emits an `ItemList` today: the builder is TASK-115 (spec 008 AC-17, `todo`), and the served `/en/occasions/mothers-day` carries no JSON-LD at all (checked on the live site 2026-10-22). That clause is not observable, so it is not asserted (a conditional "if one exists" would pass with its subject removed, DoD §4). Proposed answer: TASK-115's AC-17 ("every listing ... emits an `ItemList` whose count ... equals the rendered cards exactly") carries it for these hubs too, with no new test here. The card-count half of AC-72 is asserted in unit and e2e. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-22: Appendix A transcribed to `tests/fixtures/catalog/occasion-hub-tags.json` (74 new tags, 46 products, `*` marks checked against the data); tags applied in `products.data.ts`, `pnpm seed:project`, `listing-urls.json` regenerated (206 to 258 per locale). Draft PR 323.
- 2026-10-22: `tests/unit/occasion-hubs-complete.test.ts` (T-70, T-71, T-72 unit, T-73 unit); count pins moved (country occasion pages 7 to 59: `catalog-listing`, `catalog-country-occasion`, `catalog-shop-page`, `catalog-occasion-page`, `catalog-routes-depth4`, `catalog-read`, `corridor-shop-chips`, `shop-crawl-targets`, `api-send-route`, e2e `country-occasion`, `country-category`); e2e T-72 in `hubs.spec.ts`; visual cases for T-78 in `tests/visual/hubs.spec.ts`. Every AC mutation watched red. Next: rebase, ready, `ci:full`, Linux baselines via `visual:baselines`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

Feature PR [#323](https://github.com/itsahmeds/flowers-overseas/pull/323) with TASK-317. Appendix A's 74 new tags on 46 products are in `src/config/catalogue/products.data.ts` and the projected `seed/data/products.json`; the fifteen hubs end at 6 to 8 products and all 28 occasion hubs clear the floor in all four locales. The existence counts per launch locale move from 206 to 258 listing URLs (country occasion pages 7 to 59; 824 to 1032 over the four locales; below-floor category pairs still 21), and `tests/fixtures/shop/listing-urls.json` is regenerated. Tests: unit `occasion-hubs-complete.test.ts` (29: AC-70, AC-71, AC-72 card half, AC-73) plus ten re-pinned unit files; e2e `hubs.spec.ts` (+3 JS-off card counts), `country-occasion.spec.ts` and `country-category.spec.ts` (404 lists corrected); visual `tests/visual/hubs.spec.ts` +2 Grandparents' Day shots (T-78, Linux baselines from the `visual:baselines` run). Mutations watched red: floor 7, `fathers_day` tags removed, hub set emptied, FO-BQ-038 untagged, FO-FN-001 on `graduation`, FO-PT-004 on `fathers_day`, `muguet` at five, a country page below the floor, a stale URL fixture. Handed on: AC-72's `ItemList` clause (E-1) to TASK-115. Visible beyond the hubs, as spec item 3 says: Poland's corridor chip row grows to 17 links and every Coming up row links. No local build or browser run. Linux baselines came from `visual-baselines` run 39664028237 (7 images looked at: 2 new Grandparents' Day shots, 4 moved for the longer chip rows, the ar-XB language popup re-rendered with no visible change). The block below was taken on 726f78f3, clean; the commits after it are baselines and these notes.

```
gates:cheap · 726f78f37de959961c506494e597fb5f335bddf4 · tree clean · base origin/main · 2026-10-21T19:42:55.957Z
typecheck             exit 0 · 2.7 s
lint                  exit 0 · 23.2 s
format:check          exit 0 · 13.3 s
i18n:check            exit 0 · 1.0 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 186.7 s · changed 153 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts /src/modules/content/corpus.generated.ts
RESULT: PASS
```
