# TASK-243 — No em dash in head copy: the texts

Row: `TASKS.md` → TASK-243. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Same rulings as TASK-242. "Specs ok" approves the proposed wordings below as the targets
(spec 003 A-founder-2026-10-15a, resolution 2). Each changed text still ships `reviewed: false`.

- **Ships in TASK-242's feature PR** (`task/TASK-242-no-dash-in-titles`), built by the same agent.
  The PR description closes both IDs. Class: keeps the breaker.
- **Spec 003 clause 3:**
  - `meta.notFound.title` becomes "Page not found. Flowers Overseas".
  - `meta.error.title` becomes "Something went wrong. Flowers Overseas", and the matching titles in
    `src/modules/i18n/error-copy.data.ts` change in the same PR (A15, runbook §7).
- **Spec 004 A-founder-2026-10-15a, owned: AC-54 (T-59).**
  - `meta.home.title` becomes "Flowers Overseas: send flowers to Europe".
  - `meta.home.description`, the JSON-LD names, the H1 and the hero do not change.
  - T-59: a unit pin of the `en` value, and the four locale homes as named cases of TASK-242's scan.
- **Spec 006 A-founder-2026-10-15a, clauses 1–3 and 5 (AC-33's committed-tree half).**
  - Every product `seoTitle` becomes `{name}: {descriptor}`: the 84 `en` rows, the `de` and `pl`
    rows and the 2 `en-gb` overrides. Only the separator changes.
  - `catalog.descriptor.name` becomes "{name}: {descriptor}" in every locale.
  - The category and occasion `seoTitle`s and `seoDescription`s with a dash (10 `en` categories,
    1 `en-gb` override, 7 `en` occasions, 1 product and 1 occasion description) take a colon or a
    full stop. List any wording change in the PR for the founder.
  - SKUs, names, slugs, descriptions and the 84-row count do not change. `seed:diff` shows only
    updates to the copy columns.
- **Spec 008 A-founder-2026-10-15a, owned: AC-34 (T-38).** The new values:
  - `shop.root.seoTitle`: "Send flowers to {country}: what we can make there"
  - `shop.category.seoTitle`: "{entity} for {country}: one all-in price"
  - `shop.occasion.seoTitle`: "{occasion} flowers for {country}: {country}'s own date for it".
    The dropped "and" is approved; list it in the PR.
  - `shop.pagination.titleSuffix` keeps "·".
  - T-38 is a unit render of `countryShopRootMetadata` and `countryListingMetadata` for Poland on
    pages 1 and 2, plus the listing cases of the scan.
- **Spec 009 A-founder-2026-10-15a, owned: AC-36 (T-40).**
  - The PDP `<title>` is `{name}: {descriptor}`, or the bare name when the product has no
    descriptor. `/en/poland/product/amber-hour` reads "Amber Hour: hand-tied rose bouquet".
  - The visible heading does not change. `Product.name` has no U+2014.
  - T-40 is a unit test of a fixture with a descriptor and one without, each one exact string, plus
    the PDP sample of the scan.
- **Review state (spec 003 clause 5, spec 006 clause 5).**
  - Every changed English key and seed row ships `reviewed: false`, and no agent sets
    `reviewed: true`.
  - `de` and `pl` are redrafted from the new English: `source: machine`, `reviewed: false`, the
    new `sourceHash`.
  - When CI is green, the orchestrator writes `.claude/state/record-approval-242.py`, modelled on
    `record-approval-226.py`. It lists every changed English text: the six message keys, the seed
    rows and the `en-gb` overrides. The founder's run must land before TASK-096.
  - In `## Result`, list every changed key and row with its old and new text. The script is built
    from that list.
- **Ordering risk, 5 % share.** Indexable `meta` titles always count towards spec 003 A17's 5 %
  unreviewed share. TASK-224 measured committed `en` at 4.1 % (22 of 537), a margin of four keys.
  This task unreviews at least six counted keys. Start only after PR 225 merges: it carries
  the founder's `record-approval-226.py` run (commit `bc090490`, already made). If `i18n:check` still breaches 5 %, stop and
  escalate. Do not mark anything reviewed and do not loosen the threshold.
- **Not this task:** body copy dashes and corridor guide copy (none in head fields; spec 007).
- **Order:** after TASK-226 (PR 225), which rewrites the same `messages/*` and
  `seed/data/copy/*` rows (its founder record is already made, in that PR).

## Read

- `specs/003-i18n-foundation.md`: §14 A15, A17, A-founder-2026-10-15a
- `specs/004-design-system-layout.md`, `specs/006-…`, `specs/008-…`, `specs/009-…`: §14
  A-founder-2026-10-15a in each
- `docs/codebase-map.md`
- `messages/{en,en-gb,de,pl}.json` and `.meta.json`, `seed/data/copy/*/{products,categories,occasions}.json`,
  `seed/snapshot/product_translation.json`, `src/modules/i18n/error-copy.data.ts`,
  `src/modules/catalog/product.ts` (the descriptor composition), `.claude/state/record-approval-226.py`
  (in the main checkout; the model for the list the founder's script needs)

## Carry-forwards

- **From the 2026-10-14 site test, QA-1 Q1-03:** "Amber Hour — hand-tied rose bouquet" on every
  product page, 28 times per bouquet.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-09 (P2): the same product `<title>` ("Amber Hour — hand-tied rose bouquet", English) is on 28 URLs (7 countries × 4 locales), and the em dash is in every product, category and shop title on `c8d3b334`; this task's "Name: descriptor" shape fixes the dash. The same title across 7 countries is a ranking question for the founder (duplicate titles across country pages), not a change here: the spec fixes the title shape without a country.

## Escalations

_None recorded._

## Progress

_Not started._

## Result

_Pending._
