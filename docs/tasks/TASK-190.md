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
- **Dependency.** PR 185, because the audit that records the finding is there. Nothing else.
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
  - The provenance note still renders once per card that shows an `ai` asset (spec 008 §14 A2).
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

_None recorded._

## Progress

One line per coherent step, newest last.

_Not started._

## Result

_Pending._
