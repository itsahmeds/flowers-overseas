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

- 2026-10-18: the eight message keys, `error-copy.data.ts`, every dashed seed row (en, en-gb, de, pl) and the snapshot changed; de/pl redrafted with `i18n:draft`. Home title and description per the founder's ruling of 2026-10-18 (see `## Result`).
- 2026-10-18: T-38, T-40, T-59 unit halves in `tests/unit/head-titles.test.ts`; the scan's named cases in `tests/e2e/head-dash-scan.spec.ts`. Pins of the review state updated. Done; `in_review`.

## Result

PR: https://github.com/itsahmeds/flowers-overseas/pull/266 (one feature PR with TASK-242).

**Founder's ruling on the home title and description, 2026-10-18** (relayed by the orchestrator; it
supersedes the brief's `meta.home.title` line under Spec 004, "Flowers Overseas: send flowers to
Europe", and the "`meta.home.description` ... do not change" line):
- ~18:00Z, verbatim: "1, send flowers abroad"; then ~18:05Z, verbatim: "“Flowers Overseas | Send
  Flowers Abroad” -- this would be good no?", confirmed by the orchestrator. `meta.home.title` is
  "Flowers Overseas | Send Flowers Abroad". The "|" is one of `plan/02` §5.3's separators that spec 003
  clause 2 keeps; the colon rule covers the default case. Pinned in `tests/unit/head-titles.test.ts`
  (T-59) and `tests/e2e/head-dash-scan.spec.ts`.
- `meta.home.description` drops "European" only: "Order flowers for someone in another country. Our
  florist in their town makes the bouquet by hand and hands it over in person."
- Both are counted unreviewed for the founder's next copy batch. Other "Europe" mentions are unchanged.

**Wording changes beyond the separator, for the founder:** M8 drops "and" (approved in spec 008's
amendment); S-row FO-BQ-037 `seoDescription` "Yellow spring stems — narcissi, tulips, mimosa or
ranunculus — tied loose..." becomes "Yellow spring stems: narcissi, tulips, mimosa or ranunculus,
tied loose..." (the second dash became a comma). Every other change swaps " — " for ": ".

**Copy share (spec 003 A17):** `en-gb` unreviewed share 0.6% (3 counted keys) before, 1.8% (10)
after; `en` 0.4% to 1.7%. Under 5%, `en` and `en-gb` stay indexable.

**Side effects of the row triple (spec 003 clause 5), until the founder's record run:** `en` seed
copy reads not ready in `seed:check`'s summary; the listing pages of the 18 `en` categories and
occasions whose row changed read `reviewed: false`, so their verdict is `noindex` until the run
(nothing is indexed before TASK-096 anyway); `productExistenceCounts()`
reports 84 English products without a reviewed description (the description still renders). The
record script must also flip the pins in `tests/unit/seed-copy.test.ts` (`AWAITING_243_ROWS`,
`catalog.descriptor.name`), `tests/unit/seed-check.test.ts` (`en` ready, 102 rows),
`tests/unit/catalog-product-routes.test.ts` (`withoutDescription`) and
`tests/unit/i18n-messages-schema.test.ts` (`AWAITING_FOUNDER_REVIEW`, seven keys).

### Message keys (`messages/en.json`; `en-gb` inherits; `de`/`pl` redrafted, `source: machine`)

| # | key | old | new |
|---|---|---|---|
| M1 | `meta.home.title` | Flowers Overseas — send flowers to Europe | Flowers Overseas \| Send Flowers Abroad (the pipe is escaped in this table) |
| M2 | `meta.home.description` | Order flowers for someone in another European country. Our florist in their town makes the bouquet by hand and hands it over in person. | Order flowers for someone in another country. Our florist in their town makes the bouquet by hand and hands it over in person. |
| M3 | `meta.notFound.title` | Page not found — Flowers Overseas | Page not found. Flowers Overseas |
| M4 | `meta.error.title` | Something went wrong — Flowers Overseas | Something went wrong. Flowers Overseas |
| M5 | `catalog.descriptor.name` | {name} — {descriptor} | {name}: {descriptor} |
| M6 | `shop.root.seoTitle` | Send flowers to {country} — what we can make there | Send flowers to {country}: what we can make there |
| M7 | `shop.category.seoTitle` | {entity} for {country} — one all-in price | {entity} for {country}: one all-in price |
| M8 | `shop.occasion.seoTitle` | {occasion} flowers for {country} — and {country}'s own date for it | {occasion} flowers for {country}: {country}'s own date for it |

`src/modules/i18n/error-copy.data.ts`: the four `title` values (`en`, `en-gb`, `de`, `pl`), "Something went wrong — Flowers Overseas" to "Something went wrong. Flowers Overseas" (mirrors M4).

### Seed rows, English (`seed/data/copy/en/*`, `seed/data/copy/en-gb/*`), each now `reviewed: false`

| # | locale | row | field | old | new |
|---|---|---|---|---|---|
| S1 | en | `product:FO-BQ-001` | `seoTitle` | Amber Hour — hand-tied orange rose bouquet | Amber Hour: hand-tied orange rose bouquet |
| S2 | en | `product:FO-BQ-002` | `seoTitle` | Vistula Red — hand-tied red rose bouquet | Vistula Red: hand-tied red rose bouquet |
| S3 | en | `product:FO-BQ-003` | `seoTitle` | Baltic Dawn — hand-tied pink rose bouquet | Baltic Dawn: hand-tied pink rose bouquet |
| S4 | en | `product:FO-BQ-004` | `seoTitle` | Quiet Blush — hand-tied pastel rose bouquet | Quiet Blush: hand-tied pastel rose bouquet |
| S5 | en | `product:FO-BQ-005` | `seoTitle` | Northern Light — hand-tied white rose bouquet | Northern Light: hand-tied white rose bouquet |
| S6 | en | `product:FO-BQ-006` | `seoTitle` | Velvet Evening — hand-tied red rose bouquet | Velvet Evening: hand-tied red rose bouquet |
| S7 | en | `product:FO-BQ-007` | `seoTitle` | Rose Harbour — hand-tied pink rose bouquet | Rose Harbour: hand-tied pink rose bouquet |
| S8 | en | `product:FO-BQ-008` | `seoTitle` | Winter Rose — hand-tied white rose bouquet | Winter Rose: hand-tied white rose bouquet |
| S9 | en | `product:FO-BQ-009` | `seoTitle` | Kraków Spring — hand-tied mixed tulip bouquet | Kraków Spring: hand-tied mixed tulip bouquet |
| S10 | en | `product:FO-BQ-010` | `seoTitle` | Sunday Market — hand-tied yellow tulip bouquet | Sunday Market: hand-tied yellow tulip bouquet |
| S11 | en | `product:FO-BQ-011` | `seoTitle` | First Thaw — hand-tied white tulip bouquet | First Thaw: hand-tied white tulip bouquet |
| S12 | en | `product:FO-BQ-012` | `seoTitle` | Meadow Post — hand-tied pink tulip bouquet | Meadow Post: hand-tied pink tulip bouquet |
| S13 | en | `product:FO-BQ-013` | `seoTitle` | April Window — hand-tied purple tulip bouquet | April Window: hand-tied purple tulip bouquet |
| S14 | en | `product:FO-BQ-014` | `seoTitle` | Tulip Parade — hand-tied vibrant tulip bouquet | Tulip Parade: hand-tied vibrant tulip bouquet |
| S15 | en | `product:FO-BQ-015` | `seoTitle` | White Linen — hand-tied white lily bouquet | White Linen: hand-tied white lily bouquet |
| S16 | en | `product:FO-BQ-016` | `seoTitle` | Evening Chapel — hand-tied white lily bouquet | Evening Chapel: hand-tied white lily bouquet |
| S17 | en | `product:FO-BQ-017` | `seoTitle` | Snow Lantern — hand-tied white lily bouquet | Snow Lantern: hand-tied white lily bouquet |
| S18 | en | `product:FO-BQ-018` | `seoTitle` | Lily Terrace — hand-tied pink lily bouquet | Lily Terrace: hand-tied pink lily bouquet |
| S19 | en | `product:FO-BQ-019` | `seoTitle` | Peony Note — hand-tied pink peony bouquet | Peony Note: hand-tied pink peony bouquet |
| S20 | en | `product:FO-BQ-020` | `seoTitle` | Soft June — hand-tied pastel peony bouquet | Soft June: hand-tied pastel peony bouquet |
| S21 | en | `product:FO-BQ-021` | `seoTitle` | Blush Terrace — hand-tied pink peony bouquet | Blush Terrace: hand-tied pink peony bouquet |
| S22 | en | `product:FO-BQ-022` | `seoTitle` | Peony Hour — hand-tied white peony bouquet | Peony Hour: hand-tied white peony bouquet |
| S23 | en | `product:FO-BQ-023` | `seoTitle` | Field of Gold — hand-tied sunflower bouquet | Field of Gold: hand-tied sunflower bouquet |
| S24 | en | `product:FO-BQ-024` | `seoTitle` | High Summer — hand-tied yellow sunflower bouquet | High Summer: hand-tied yellow sunflower bouquet |
| S25 | en | `product:FO-BQ-025` | `seoTitle` | Late Harvest — hand-tied orange sunflower bouquet | Late Harvest: hand-tied orange sunflower bouquet |
| S26 | en | `product:FO-BQ-026` | `seoTitle` | Bright Side — hand-tied vibrant gerbera bouquet | Bright Side: hand-tied vibrant gerbera bouquet |
| S27 | en | `product:FO-BQ-027` | `seoTitle` | Carousel — hand-tied mixed gerbera bouquet | Carousel: hand-tied mixed gerbera bouquet |
| S28 | en | `product:FO-BQ-028` | `seoTitle` | Warsaw Morning — hand-tied mixed flower bouquet | Warsaw Morning: hand-tied mixed flower bouquet |
| S29 | en | `product:FO-BQ-029` | `seoTitle` | Garden Letter — hand-tied pastel garden bouquet | Garden Letter: hand-tied pastel garden bouquet |
| S30 | en | `product:FO-BQ-030` | `seoTitle` | Late Summer Table — hand-tied orange bouquet | Late Summer Table: hand-tied orange bouquet |
| S31 | en | `product:FO-BQ-031` | `seoTitle` | Pastel Weekend — hand-tied pastel posy | Pastel Weekend: hand-tied pastel posy |
| S32 | en | `product:FO-BQ-032` | `seoTitle` | Painter's Table — hand-tied vibrant bouquet | Painter's Table: hand-tied vibrant bouquet |
| S33 | en | `product:FO-BQ-033` | `seoTitle` | Long Weekend — hand-tied mixed bunch | Long Weekend: hand-tied mixed bunch |
| S34 | en | `product:FO-BQ-034` | `seoTitle` | Season's Hand — hand-tied seasonal bouquet | Season's Hand: hand-tied seasonal bouquet |
| S35 | en | `product:FO-BQ-035` | `seoTitle` | Harvest Light — hand-tied autumn bouquet | Harvest Light: hand-tied autumn bouquet |
| S36 | en | `product:FO-BQ-036` | `seoTitle` | Winter Table — hand-tied white winter bouquet | Winter Table: hand-tied white winter bouquet |
| S37 | en | `product:FO-BQ-037` | `seoTitle` | Spring Post — hand-tied yellow spring bouquet | Spring Post: hand-tied yellow spring bouquet |
| S38 | en | `product:FO-BQ-037` | `seoDescription` | Yellow spring stems — narcissi, tulips, mimosa or ranunculus — tied loose with their own leaves. For Easter and Mother's Day. | Yellow spring stems: narcissi, tulips, mimosa or ranunculus, tied loose with their own leaves. For Easter and Mother's Day. |
| S39 | en | `product:FO-BQ-038` | `seoTitle` | Old Town — hand-tied red carnation bouquet | Old Town: hand-tied red carnation bouquet |
| S40 | en | `product:FO-BQ-039` | `seoTitle` | Blue Hour — hand-tied blue hydrangea bouquet | Blue Hour: hand-tied blue hydrangea bouquet |
| S41 | en | `product:FO-BQ-040` | `seoTitle` | Morning Scent — hand-tied white freesia bouquet | Morning Scent: hand-tied white freesia bouquet |
| S42 | en | `product:FO-AR-001` | `seoTitle` | Small Kindness — pastel flowers in a box | Small Kindness: pastel flowers in a box |
| S43 | en | `product:FO-AR-002` | `seoTitle` | Mantelpiece — red roses in a glass vase | Mantelpiece: red roses in a glass vase |
| S44 | en | `product:FO-AR-003` | `seoTitle` | Welcome Home — mixed flowers in a basket | Welcome Home: mixed flowers in a basket |
| S45 | en | `product:FO-AR-004` | `seoTitle` | Desk Bloom — gerberas in a low pot | Desk Bloom: gerberas in a low pot |
| S46 | en | `product:FO-AR-005` | `seoTitle` | Paper Window — pink tulips in a container | Paper Window: pink tulips in a container |
| S47 | en | `product:FO-AR-006` | `seoTitle` | Glass Morning — white lilies in a glass vase | Glass Morning: white lilies in a glass vase |
| S48 | en | `product:FO-AR-007` | `seoTitle` | Kitchen Table — seasonal flowers in a crate | Kitchen Table: seasonal flowers in a crate |
| S49 | en | `product:FO-AR-008` | `seoTitle` | Hallway Light — white flowers in a tall vase | Hallway Light: white flowers in a tall vase |
| S50 | en | `product:FO-AR-009` | `seoTitle` | Reading Corner — purple freesias arranged short | Reading Corner: purple freesias arranged short |
| S51 | en | `product:FO-AR-010` | `seoTitle` | Studio Vase — pink peonies in a heavy vase | Studio Vase: pink peonies in a heavy vase |
| S52 | en | `product:FO-AR-011` | `seoTitle` | Garden Crate — seasonal flowers and herbs | Garden Crate: seasonal flowers and herbs |
| S53 | en | `product:FO-AR-012` | `seoTitle` | White Cube — white roses arranged square | White Cube: white roses arranged square |
| S54 | en | `product:FO-AR-013` | `seoTitle` | Copper Bowl — orange chrysanthemums in a bowl | Copper Bowl: orange chrysanthemums in a bowl |
| S55 | en | `product:FO-AR-014` | `seoTitle` | Linen Basket — pastel alstroemeria in a basket | Linen Basket: pastel alstroemeria in a basket |
| S56 | en | `product:FO-PT-001` | `seoTitle` | Moth Orchid White — white orchid plant in a pot | Moth Orchid White: white orchid plant in a pot |
| S57 | en | `product:FO-PT-002` | `seoTitle` | Moth Orchid Pink — pink orchid plant in a pot | Moth Orchid Pink: pink orchid plant in a pot |
| S58 | en | `product:FO-PT-003` | `seoTitle` | Twin Orchid — two-stem white orchid plant | Twin Orchid: two-stem white orchid plant |
| S59 | en | `product:FO-PT-004` | `seoTitle` | Peace Lily — peace lily plant in a pot | Peace Lily: peace lily plant in a pot |
| S60 | en | `product:FO-PT-005` | `seoTitle` | Anthurium — red anthurium plant in a pot | Anthurium: red anthurium plant in a pot |
| S61 | en | `product:FO-PT-006` | `seoTitle` | Olive Sapling — small olive tree in terracotta | Olive Sapling: small olive tree in terracotta |
| S62 | en | `product:FO-PT-007` | `seoTitle` | Jasmine Pot — scented jasmine plant in flower | Jasmine Pot: scented jasmine plant in flower |
| S63 | en | `product:FO-PT-008` | `seoTitle` | Azalea Pot — pink azalea plant in a pot | Azalea Pot: pink azalea plant in a pot |
| S64 | en | `product:FO-FN-001` | `seoTitle` | Farewell Wreath — white funeral wreath | Farewell Wreath: white funeral wreath |
| S65 | en | `product:FO-FN-002` | `seoTitle` | Standing Spray — white funeral spray | Standing Spray: white funeral spray |
| S66 | en | `product:FO-FN-003` | `seoTitle` | Casket Spray — white lily casket spray | Casket Spray: white lily casket spray |
| S67 | en | `product:FO-FN-004` | `seoTitle` | White Heart — white rose heart tribute | White Heart: white rose heart tribute |
| S68 | en | `product:FO-FN-005` | `seoTitle` | Sympathy Basket — white sympathy flowers in a basket | Sympathy Basket: white sympathy flowers in a basket |
| S69 | en | `product:FO-FN-006` | `seoTitle` | Grave Bouquet — mixed chrysanthemum grave bouquet | Grave Bouquet: mixed chrysanthemum grave bouquet |
| S70 | en | `product:FO-FN-007` | `seoTitle` | Memorial Cross — white chrysanthemum cross | Memorial Cross: white chrysanthemum cross |
| S71 | en | `product:FO-FN-008` | `seoTitle` | Quiet Wreath — pastel funeral wreath | Quiet Wreath: pastel funeral wreath |
| S72 | en | `product:FO-FN-009` | `seoTitle` | Condolence Bouquet — white rose sympathy sheaf | Condolence Bouquet: white rose sympathy sheaf |
| S73 | en | `product:FO-FN-010` | `seoTitle` | Stone Garden — low white memorial arrangement | Stone Garden: low white memorial arrangement |
| S74 | en | `product:FO-GS-001` | `seoTitle` | Amber Hour + Chocolates — roses and chocolates | Amber Hour + Chocolates: roses and chocolates |
| S75 | en | `product:FO-GS-002` | `seoTitle` | Baltic Dawn + Vase — pink roses and a glass vase | Baltic Dawn + Vase: pink roses and a glass vase |
| S76 | en | `product:FO-GS-003` | `seoTitle` | Welcome Baby Blue + Plush — blue flowers and a soft toy | Welcome Baby Blue + Plush: blue flowers and a soft toy |
| S77 | en | `product:FO-GS-004` | `seoTitle` | Welcome Baby Pink + Plush — pink flowers and a soft toy | Welcome Baby Pink + Plush: pink flowers and a soft toy |
| S78 | en | `product:FO-GS-005` | `seoTitle` | Kraków Spring + Chocolates — tulips and chocolates | Kraków Spring + Chocolates: tulips and chocolates |
| S79 | en | `product:FO-GS-006` | `seoTitle` | Quiet Blush + Vase — pastel roses and a glass vase | Quiet Blush + Vase: pastel roses and a glass vase |
| S80 | en | `product:FO-GS-007` | `seoTitle` | Field of Gold + Chocolates — sunflowers and chocolates | Field of Gold + Chocolates: sunflowers and chocolates |
| S81 | en | `product:FO-GS-008` | `seoTitle` | Peony Note + Vase — pink peonies and a glass vase | Peony Note + Vase: pink peonies and a glass vase |
| S82 | en | `product:FO-GS-009` | `seoTitle` | Warsaw Morning + Balloon — mixed flowers and a balloon | Warsaw Morning + Balloon: mixed flowers and a balloon |
| S83 | en | `product:FO-GS-010` | `seoTitle` | Bright Side + Balloon — gerberas and a balloon | Bright Side + Balloon: gerberas and a balloon |
| S84 | en | `product:FO-GS-011` | `seoTitle` | White Linen + Chocolates — white lilies and chocolates | White Linen + Chocolates: white lilies and chocolates |
| S85 | en | `product:FO-GS-012` | `seoTitle` | Garden Letter + Plush — pastel flowers and a soft toy | Garden Letter + Plush: pastel flowers and a soft toy |
| S86 | en | `category:bouquet` | `seoTitle` | Hand-tied bouquets — flowers delivered across Europe | Hand-tied bouquets: flowers delivered across Europe |
| S87 | en | `category:arrangement` | `seoTitle` | Flower arrangements — delivered ready to display | Flower arrangements: delivered ready to display |
| S88 | en | `category:plant` | `seoTitle` | Flowering plants — orchids, peace lilies and more | Flowering plants: orchids, peace lilies and more |
| S89 | en | `category:gift_set` | `seoTitle` | Flowers and gift sets — bouquets with chocolates, a vase or more | Flowers and gift sets: bouquets with chocolates, a vase or more |
| S90 | en | `category:romance` | `seoTitle` | Romantic flowers — red roses and peonies delivered | Romantic flowers: red roses and peonies delivered |
| S91 | en | `category:apology` | `seoTitle` | Sorry flowers — apology flowers delivered across Europe | Sorry flowers: apology flowers delivered across Europe |
| S92 | en | `category:roses` | `seoTitle` | Roses delivered across Europe — red, pink and white | Roses delivered across Europe: red, pink and white |
| S93 | en | `category:tulips` | `seoTitle` | Tulips delivered across Europe — mixed, yellow and pink | Tulips delivered across Europe: mixed, yellow and pink |
| S94 | en | `category:lilies` | `seoTitle` | Lilies delivered across Europe — white and pink | Lilies delivered across Europe: white and pink |
| S95 | en | `category:peonies` | `seoTitle` | Peonies delivered across Europe — pink and white | Peonies delivered across Europe: pink and white |
| S96 | en | `occasion:housewarming` | `seoDescription` | Baskets, crates, bowls and plants for a home with no vase — olive saplings, peace lilies and anthuriums. A door code helps. | Baskets, crates, bowls and plants for a home with no vase: olive saplings, peace lilies and anthuriums. A door code helps. |
| S97 | en | `occasion:womens_day` | `seoTitle` | Women's Day flower delivery — 8 March across Europe | Women's Day flower delivery: 8 March across Europe |
| S98 | en | `occasion:all_saints` | `seoTitle` | All Saints' Day flower delivery — 1 November | All Saints' Day flower delivery: 1 November |
| S99 | en | `occasion:sant_jordi` | `seoTitle` | Sant Jordi rose delivery — 23 April in Catalonia | Sant Jordi rose delivery: 23 April in Catalonia |
| S100 | en | `occasion:fete_des_grands_meres` | `seoTitle` | Grandmothers' Day in France — flower delivery | Grandmothers' Day in France: flower delivery |
| S101 | en | `occasion:muguet` | `seoTitle` | May Day lily of the valley — 1 May delivery in France | May Day lily of the valley: 1 May delivery in France |
| S102 | en | `occasion:omatag` | `seoTitle` | Grandmother's Day in Estonia — flower delivery | Grandmother's Day in Estonia: flower delivery |
| S103 | en | `occasion:17_mai` | `seoTitle` | Norwegian Constitution Day flower delivery — 17 May | Norwegian Constitution Day flower delivery: 17 May |
| S104 | en-gb | `product:FO-AR-007` | `seoTitle` | Kitchen Table — seasonal flowers in a crate | Kitchen Table: seasonal flowers in a crate |
| S105 | en-gb | `product:FO-GS-006` | `seoTitle` | Quiet Blush + Vase — pastel roses and a glass vase | Quiet Blush + Vase: pastel roses and a glass vase |
| S106 | en-gb | `category:apology` | `seoTitle` | Sorry flowers — apology flowers delivered across Europe | Sorry flowers: apology flowers delivered across Europe |

### Seed rows, German and Polish

- `de`, `pl` products: all 84 rows redrafted by `pnpm i18n:draft` from the new English (`translationStatus: machine`, `reviewed: false`, new `sourceHash`); only `seoTitle` (and FO-BQ-037's `seoDescription`) changed.
- `de`, `pl` categories and occasions: 104 native `seoTitle`s (human-drafted, already `reviewed: false`) had their spaced en dash replaced by a colon, words unchanged (e.g. "Geburtstag – Blumen europaweit verschicken" to "Geburtstag: Blumen europaweit verschicken"); the 18 rows whose English source changed carry the new English `sourceHash`.

