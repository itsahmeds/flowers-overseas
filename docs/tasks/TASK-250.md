# TASK-250 — Three catalogue photographs that do not show their product (Anthurium, Baltic Dawn + Vase, Bright Side + Balloon)

Row: `TASKS.md` → TASK-250. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

- **The finding (Q1-15, P2, still on `c8d3b334`, QA-1 and QA-2 re-test of 2026-10-14).**
  - **Anthurium** (FO-PT-005): the photograph shows an amaryllis.
  - **Baltic Dawn + Vase** (FO-GS-002) and **Bright Side + Balloon** (FO-GS-010): the photograph
    shows a box, not the vase or the balloon the name promises.
  Inspect each product's `-hero` and `-detail` assets in `seed/data/media.json` and
  `seed/data/alt/en.json` first; the alt text may describe the photograph truthfully while the
  product name does not match it, as with TASK-190.
- **Spec.** `specs/006-seed-catalogue-import-imagery-pipeline.md`: AC-8 (provenance honest:
  `depicts: "product"` must be true of the product), AC-18 (`Photo` renders an `<img>` only for an
  approved asset with variants and alt), §14 A7 clause 5 (intake), §14 A9 (alt). No new AC: explicit
  scope, as TASK-166 and TASK-190 were.
- **The decision is the founder's; ask it first** (through the orchestrator, recorded under
  `## Escalations`): replace the photographs, rename the products, or withdraw the assets.
  **Default if unanswered: withdraw**: set the assets that show the wrong thing out of `approved`
  (`pending` or `rejected`, with the fields `seed/schema/media.ts` requires). The cards, product
  pages and hubs then render spec 006's honest placeholder, with no `<img>` and no preload
  (spec 008 §14 A11's zero). Follow TASK-190's brief for the mechanics.
- **Replace only with photographs the founder supplies and approves** through the spec 006 §14 A7
  intake. Never generate or approve one yourself.
- **Copy.** Renaming a product is new public copy in four locales: blocked on the founder's copy
  batch (`en-gb` sits at 4.98% of the 5% line). Withdrawing and replacing add no copy.
- **Review class.** Keeps the breaker (seed data, indexed pages).
- **Tests.** One regression per product, each red on `c8d3b334`'s data: for each of FO-PT-005,
  FO-GS-002 and FO-GS-010 no approved asset whose recorded `depicts` or alt contradicts the name;
  after a withdraw, the card and the product page carry no `<img>` for it. Assert the one product,
  not the set.

## Read

- `specs/006-seed-catalogue-import-imagery-pipeline.md` — `## 0. Index`, AC-8, AC-18, §14 A7, A9
- `docs/tasks/TASK-190.md` — the same defect, the same mechanics
- `seed/data/media.json`, `seed/data/alt/en.json`, `seed/schema/media.ts`, `docs/codebase-map.md`
- `.claude/state/qa-2026-10-18/QA-1.md` (re-test list, Q1-15)

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

- 2026-10-18: replace, rename or withdraw the three photographs? Asked of the founder via the
  planning PR's body. Answer: `open`. Status stays `blocked` until it is recorded here.

## Progress

_Not started._

## Result

_Pending._
