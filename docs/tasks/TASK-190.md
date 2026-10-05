# TASK-190 — The two mismatched catalogue photographs (Olive Sapling, Peace Lily)

Row: `TASKS.md` → TASK-190. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **The finding.** `docs/design/audits/2026-10-04-site-sweep.md` §1 finding 15 and §3 row "12–17",
  which says to replace or rename the two products and calls this catalogue data, not design. Two
  approved hero photographs do not show the product they are named for:
  - **Olive Sapling** (FO-PT-006): `fo-pt-006-hero` shows a hydrangea. `seed/data/media.json` L3079;
    `seed/data/alt/en.json` L693–L694: "A hydrangea plant with pink, blue, purple, cream and lime
    green flower heads in a plain white ceramic pot".
  - **Peace Lily** (FO-PT-004): `fo-pt-004-hero` shows a lily plant, not a peace lily.
    `seed/data/media.json` L3007; `seed/data/alt/en.json` L677–L678: "A white lily plant in flower,
    with buds and upright leaves, in a plain white ceramic pot".

  Both are `reviewState: "approved"` by the founder on 2026-10-03 (spec 006 §14 A7 clause 5,
  TASK-168). Their alt texts describe the photographs truthfully; it is the products they stand for
  that they do not show.
- **Spec.** `specs/006-seed-catalogue-import-imagery-pipeline.md`:
  - AC-8, provenance honest: `depicts: "product"` must be true of the product;
  - AC-18: `Photo` renders an `<img>` only for an approved asset with variants and alt;
  - §14 A9: alt is required for every asset that can render.

  No new AC: this is explicit scope, as TASK-166 was.
- **Dependency.** PR 185, because the audit that records the finding is there. This task draws
  nothing, so spec 004 §14 A24 clause 11 releases it from A23 clause 10's wait for the round-2
  design PR (PR 189). The founder's photograph decision below may be asked at any time.
- **The decision is the founder's; ask it first** (through the orchestrator, recorded under
  `## Escalations`): replace the two photographs, or withdraw them.
  - **Default if unanswered: withdraw.** Set both hero assets (and any `-detail` asset that shows the
    same wrong plant; inspect `fo-pt-004-detail` and `fo-pt-006-detail`) out of `approved`, using the
    `pending` or `rejected` state of `seed/schema/media.ts` L76 with the fields that state requires.
    The cards, the product pages and the plants hub then render spec 006's honest placeholder, with
    no `<img>` and no preload, per spec 008 §14 A11's zero.
  - **Replace:** only with photographs the founder supplies and approves, through the spec 006 §14
    A7 intake: prompt records, `media:variants`, upload of the approved ids only, alt in four
    locales. Never generate or approve one yourself.
  - **Never rename a product** to fit a photograph. A rename changes the slug (spec 006 AC-7), the
    URL and the reviewed copy.
- **What to check after the change.**
  - `pnpm seed:check` and `pnpm media:variants --check` are green.
  - Every page that showed either photograph (the plants category hub, whose artboard draws both;
    Poland's plants category; the two product pages; any hub that leads with one) still nominates at
    most one `priority` image, and nominates **zero** when its lead is now a placeholder (spec 008
    §14 A11).
  - No `leadSku` in `src/config/catalogue/listing-presentation.ts` (TASK-187) points at a withdrawn
    asset's product. If one does, flag it to the orchestrator.
  - The provenance note still renders once per card that shows an `ai` asset from `md` up (spec 008
    §14 A2), and once per grid, above the grid, below `md` (spec 008 §14 A16).
  - A hub whose lead is now a placeholder still downloads no lead image below `md` (spec 004 §14
    A24 clause 5).
- **Review class.** Keeps the breaker: the approval state of published media and the LCP nomination
  of live pages.
- **Tests.**
  - A unit case in the seed-media tests: neither SKU's primary asset is `approved` with the wrong
    `depicts` subject. Concretely, the two asset ids are not `approved` (withdraw), or their prompt
    hashes equal the new records (replace). Watch it go red with the old `approved` row restored.
  - An e2e case on `/en/poland/product/olive-sapling` and `/en/poland/product/peace-lily`: no `<img>`
    whose source is the withdrawn asset, and zero preloads.

## Read

- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, AC-8, AC-18, §14 A7, A9, A11
- `specs/008-country-shop-category-occasion-pages.md` — §14 A2, A11
- `docs/codebase-map.md`
- `seed/data/media.json`, `seed/data/alt/*.json`, `seed/schema/media.ts`, `docs/tasks/TASK-168.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

_None._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-05: Replace the two photographs or withdraw them? The question went to the founder through the orchestrator, and it is `open`. The implementer inspected all four originals. `fo-pt-004-hero`/`-detail` show a white lily (*Lilium*, red stamens), and `fo-pt-006-hero`/`-detail` show hydrangeas, so both detail shots are wrong too. No approved original in `.local/imagery/originals/` shows a peace lily (*Spathiphyllum*) or an olive sapling, so the brief's default was applied: withdraw. A replacement needs founder-supplied, founder-approved photographs through the spec 006 §14 A7 intake.
- 2026-10-05: `src/config/catalogue/listing-presentation.ts` (TASK-187) is not on `main`, so no `leadSku` could be checked. Orchestrator: once TASK-187 lands, check that no `leadSku` is `FO-PT-004` or `FO-PT-006`.

## Progress

One line per coherent step, newest last.

- 2026-10-05: The four assets are rejected and their alt rows removed, the snapshot is rewritten, and the unit block was watched red, then green (8803afd8).
- 2026-10-05: The e2e case went on the two product pages (bb899753), and draft PR 202 was opened.
- 2026-10-05: All 820 listing pages were probed. None leads with either product.

## Result

PR 202 (https://github.com/itsahmeds/flowers-overseas/pull/202). **Withdraw**, the brief's default, applied because no approved original shows either product (Escalations).

- **Data.** `fo-pt-004-hero`, `fo-pt-004-detail`, `fo-pt-006-hero` and `fo-pt-006-detail` are `rejected` in `seed/data/media.json`. The founder's 2026-10-03 `reviewedBy`/`reviewedAt` are removed, and provenance, SKU, order and `isPrimary` are kept. Their alt rows are removed from all four `seed/data/alt/*.json` (spec 006 §14 A9 clause 4). `seed/snapshot/product_media_alt.json` is rewritten with `pnpm seed:diff --write`. `media-variants.json` is untouched. Neither product is renamed.
- **Checks after the change.** `pnpm seed:check` passes (exit 0). `pnpm media:variants --check` passes (exit 0). `pnpm seed:diff` exits 0. Both product pages render the placeholder gallery and nominate zero. A probe of all 820 listing pages (the `listingView()` of each record from `listingPages()`) found none that leads with either product or with a placeholder. Poland's plants category and the plants hub both lead with Anthurium (photographed), so each still nominates exactly one. The nearest any withdrawn card comes to a lead is index 2 (retirement hubs) and index 3 (wedding hubs). The provenance note and the below-`md` lead rules are unchanged, because no lead changed. `listing-presentation.ts` is not on `main` (see Escalations).
- **Tests.** Unit, `tests/unit/seed-media-manifest.test.ts`: a new TASK-190 block of 14 cases, and the approval counts move from 175 to 171 (also in `seed-check.test.ts`). In `media-variants.test.ts` the approved product heroes move from 84 to 82. e2e, `tests/e2e/product-page.spec.ts`: 2 cases (`/en/poland/product/peace-lily`, `/en/poland/product/olive-sapling`): the placeholder gallery, no `img`/`source`/`link` carrying the asset id, zero image preloads and no `fetchpriority="high"`.
- **Mutation.** With `origin/main`'s `media.json` restored (the four `approved` rows), `seed-media-manifest.test.ts` goes red on 14 cases: all 12 new ones and both count cases. The e2e cases go red only when the whole data change is reverted. Restoring the `approved` rows without the alt keeps the gallery a placeholder, and in that state `seed:check` fails (`media/alt-missing`) and so does the unit block. The e2e was not run locally (CI's gate; no build slot taken).
- **Unit suite.** A full `pnpm test` at a load average of 38 gave 12 timeouts of 5 s and 3 real failures. The 3 were the two count sites and the codebase map, and all three are fixed. The 12 files re-ran with `--testTimeout=120000` at a load of 16: 643 of 643 pass.

```
gates:cheap · bb8997539c13ce65a8d82339971f68a2cf53efbf · tree DIRTY · base origin/main · 2026-10-05T03:46:54.771Z
typecheck             exit 0 · 3.1 s
lint                  exit 0 · 22.4 s
format:check          exit 0 · 12.7 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 92.1 s · changed 85 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
(The dirty tree was this brief and the TASKS row, neither of which is code.)
