# `seed/` — the catalogue dataset and the scripts that read it

Owned by spec 006 (`specs/006-seed-catalogue-import-imagery-pipeline.md`); the tables and the
upsert plumbing are spec 002's. Two directories and one rule.

## The rule: never hand-edit a projected file

`seed/data/` holds two kinds of file, and every file says which kind it is in its own header:

| `origin` | Files | Who edits them |
|---|---|---|
| `projected` | `taxonomy.json`, `categories.json`, `occasions.json`, `products.json`, `product-tiers.json`, `addons.json`, `prices/{ISO2}.json`, `addon-prices/{ISO2}.json` | **Nobody.** Edit `src/config/catalogue/*.data.ts` and run `pnpm seed:project` |
| `authored` | `occasion-country.json`, `media.json`, `media-variants.json`, `copy/en/**`, `copy/en-gb/**` (and `alt/`, from TASK-079) | A human, in the file — except `media-variants.json`, which `pnpm media:variants` writes and nobody edits, and `copy/de/**` + `copy/pl/**`, which `pnpm i18n:draft --locale <code>` writes |

ADR-0017 is why: `src/config/catalogue/` is the **single authored source** of catalogue entities,
so that one edit changes the demo, the seed and later the database, and "price shown = price
charged" has one origin. A second hand-authored copy of the 84 products would disagree within a
week. `tests/unit/seed-dataset.test.ts` re-projects the dataset in memory and compares the bytes,
so a hand edit to a projected file — or an edit to the authored source without re-running the
generator — fails CI with the file named.

`pnpm seed:project --check` is the same assertion as a command.

## Layout

```
seed/schema/     the zod schemas and the to*Row() projections onto spec 002 §5.1's columns
seed/data/       the dataset (JSON, one file per entity family, header on every file)
seed/project.ts  pnpm seed:project — regenerates the projected files, offline and deterministic
seed/media-variants.ts
                 pnpm media:variants — the deterministic sharp ladder: EXIF/GPS stripped, the
                 slot's aspect ratio, AVIF+WebP at seven widths plus one OG/email JPEG, and
                 seed/data/media-variants.json rewritten with a checksum per file. `--check` is
                 the CI mode (manifest ↔ files ↔ checksums); generation never runs in CI
seed/check.ts    pnpm seed:check  — the gate: nine rule families + the health report (--report)
seed/copy.ts     the copy rules (word band, closing sentence, superlatives, delivery timing)
seed/budgets.ts  the committed-imagery byte caps rule family 9 enforces
```

The pinned encoder — the `sharp` and libvips versions, the widths, the aspect-ratio table, the
metadata policy and every encoder option — is `seed/schema/variants.ts`, and
`pnpm media:variants` writes it into the manifest's own `pipeline` header. That is what makes
changing one quality setting a whole-manifest re-derivation with a visible diff rather than a
silent re-encode (spec 006 AC-13), and it is the record TASK-082's `media.derive_variants` worker
has to match checksum-for-checksum (AC-25). The encoder is held to **one thread** because
libaom's AVIF output depends on its thread count: without that pin, "byte-identical across two
runs" would only be true on the machine that ran them.

`seed/schema/prompts.ts` is the one piece of this directory whose *content* lives elsewhere: the
imagery prompt records are `content/imagery/prompts/{SKU}.json` (prose a non-programmer edits) and
this module holds their schema plus the canonicalisation whose SHA-256 is the `promptHash` every
`media.json` asset carries. `content/imagery/style-guide.md` is the guide those prompts are written
from; originals are never committed (`content/imagery/README.md`).

`seed/data/prices/{ISO2}.json` and `seed/data/addon-prices/{ISO2}.json` exist once per **priced
destination** — the `live` and `demo` countries of `src/config/countries.ts`, seven of them. The
eighth seeded country of `plan/10` §2.1 is the UK, which is the first *buyer* market (ADR-0002)
and not a place we deliver to, so it has no price file: a row there would price nothing.

## The gate: `pnpm seed:check`

```
pnpm seed:check            # exit 0 on a clean tree, one line per problem otherwise
pnpm seed:check --report   # also print the §11 catalogue-health report (the CI step summary)
```

**Nine rule families** (spec 006 §2.3), and a failure line always names the file, the entity key
and the rule:

| # | Family | Turning it red means |
|---|---|---|
| 1 | `schema` | a file does not parse, its `version`/`source`/`origin` header is wrong, or a **projected** file was hand-edited (`pnpm seed:project` re-writes it) |
| 2 | `counts` | not 84 products in the 40/14/8/10/12 split, not 23 categories, not 6 add-ons, the occasion facet not seeded whole, or the launch destination's category coverage has fallen under the six-product rule |
| 3 | `references` | a facet value, a category or occasion edge, a price row, a media asset, a variant, an alt entry, a copy row or a prompt hash points at something that does not exist |
| 4 | `slugs` | a slug is not ASCII / lowercase / hyphenated, has a trailing slash, is not the ASCII fold of its name, or is used by two entities in one locale (**products, categories and occasions share one namespace per locale**) |
| 5 | `prices` | a band, a psychological ending, a tier step, a float amount, a missing price or a second open-ended row — the same checks `catalogue:check` runs, over the rows in these files |
| 6 | `copy` | a description outside 60–90 words, one that does not end with the local-florist sentence, a banned superlative, a duplicate description, a missing name, or any delivery-timing claim (spec 006 §14 A4) |
| 7 | `media` | provenance, two primaries for one product, a `delivery` asset, or — once `media-variants.json` / `alt/` exist — a variant with no file, a byte mismatch, or missing alt text in a launch locale |
| 8 | `privacy` | an `@`-shaped, phone-shaped or postcode-shaped string, a person outside the allowlist in a person field, or a competitor mark — reported with the **JSON path** so the value can be found |
| 9 | `budgets` | committed derived imagery over 6 MB in total, or one file over its slot's cap |

**How to read a failure.** Each line is `file: [family/rule] \`key\` message`. Fix the file the line
names — except in family 5, where the file named is `src/config/catalogue/*.data.ts`, because a
price is authored there and the dataset file is a projection (ADR-0017): edit the module and run
`pnpm seed:project`. A `schema/stale-projection` line means exactly that too. Families are
independent: a fault is reported by every family that can see it, and one fixture per family
proves each one is live.

**The fixtures.** `tests/fixtures/seed/_cases/<family>/` holds one case per family. A case is a
small declarative overlay — the file it replaces, the family and rule it must trip, the message
substring, and one or two mutations (`seed/check-cases.ts`) — rather than a copy of a dataset
file, so a fixture cannot rot into a stale duplicate of 84 authored descriptions. The five
deliberately faulty **price blocks** (out-of-band, float amount, wrong psychological ending, a
second open-ended row, an unknown tier, plus the matching good control) live in
`tests/fixtures/seed/_cases/prices/` as whole blocks (spec 006 AC-6) and are spliced in by the
`case-*.json` beside them.

**The report** (`--report`, spec 006 §11) is the standing catalogue-health record: product counts
by type, the per-(country, category) and per-(country, occasion) coverage table against `plan/02`
§6's six-product rule with **both sides** of the threshold visible, price extremes, the
description word-count distribution, copy review shares per locale, committed image bytes,
per-slot maxima, the count of products still rendering a placeholder, and the ten
category/occasion `seoTitle` near-duplicate pairs spec 008 must nominate a primary for. Every
readiness column in it is computed from the predicate the application gates on
(`isLocaleIndexable()`, `country.status`), so **a locale or a country cannot look ready in CI
while it is gated in code**. `de` and `pl` reading 100 % machine-drafted and *not ready* is the
correct answer, not a gap.

`seed/diff.ts` (`pnpm seed:diff`, TASK-076), `seed/media-variants.ts` (TASK-078),
`seed/index.ts` (`pnpm db:seed`, TASK-083) and `seed/upload.ts` (TASK-082) join the directory in
the tasks named.

## Facts worth knowing before you edit anything

- **No database, no network, no clock.** `seed/schema/**`, `seed/project.ts`, `seed/copy*.ts`,
  `seed/check*.ts` and `seed/budgets.ts` are covered by
  `pnpm check:no-db`; the projector reads only the authored modules, which is what makes its
  output byte-identical on every machine. `seed/index.ts` and `seed/upload.ts` are the exceptions
  by design and arrive with spec 002's provisioning (spec 006 §2.6).
- **Every row is `source: "seed"`.** The importer never touches a row whose `source` is `real`
  (`plan/10` §4): seed → real is a data change, not a deploy.
- **Money is integer minor units plus a currency**, VAT and delivery included, one open-ended row
  per (product, country, tier, surcharge) — the file-level mirror of spec 002's partial unique
  index, and what preserves the Omnibus 30-day-lowest history by superseding rather than updating.
- **Copy carries the review triple** (`translationStatus`, `reviewed`, `sourceHash`). A machine
  draft is flagged and its locale stays non-indexable until a native reviewer approves it
  (`plan/03` §6 gate 4). That is the intended state of `de`/`pl` in Phase 0, not a gap.
- **Imagery provenance is required data**, and `depicts: "delivery"` is rejected outright in
  Phase 0: a real delivery photograph carries consent and is spec 018/027's (`plan/07` §1.2).
- **The occasion calendar's dates need verification** against official calendars before a country
  goes live (`plan/13` D6). The note is in `occasion-country.json` itself, and the evaluator
  `occasionDate(rule, year)` is spec 009's — nothing here computes a date.

## Catalogue copy (`seed/data/copy/{locale}/{entity}.json`)

`en` is the source of truth and is authored by hand: 84 product descriptions, 23 category intros
and 32 occasion intros, each 60–90 words stating contents, size, who it suits and what our florist
may substitute, and each ending with the **one** shared local-florist sentence. `en-gb` holds
**only** the rows whose British wording differs (four, today — the `-ise` spellings and
"centrepiece"); a full `en-gb` copy of the dataset is a bug, and
`tests/unit/seed-copy.test.ts` fails it.

`de` and `pl` are **machine drafts**: `pnpm i18n:draft --locale de` fills them from `copy/en/`
with `translationStatus: "machine"`, `reviewed: false` and the `en` row's `sourceHash`. That is
the intended Phase-0 state, and its consequence is deliberate — German and Polish product pages
are **non-indexable** until a native reviewer replaces the draft and flips the row to `human`
(`plan/03` §6 gate 4, `plan/02` §12). A reviewer's row is never overwritten by a re-run; if the
English source moved, the run reports it `stale`.

Four rules worth knowing before editing copy:

- **The closing sentence is not authored in the rows.** It lives once per locale in
  `messages/*.json` under `catalog.floristSentence`. Reword it there and run
  `pnpm i18n:draft --sync-copy`: every description in every locale is re-flowed, and nothing
  before its last sentence is touched.
- **Names stay English, descriptors localise** (spec 006 §13 Q2). A row's `name` is the evocative
  name (`Amber Hour`) in all four locales, its `slug` is the ASCII fold of that name, and the
  localised descriptor ("hand-tied rose bouquet" / "Rosenstrauß, handgebunden") is composed at
  render from `catalog.descriptor.*`. That keeps one brandable product per hreflang cluster and
  one stable URL per locale.
- **No two rows may share a description** (the thin-content guard of spec 006 §6), no description
  may use a superlative from `BANNED_SUPERLATIVES`, and no copy may name a competitor, contain an
  address-shaped or phone-shaped string, or use the words `relay`, `corridor`, `partner`,
  `third party` or `network` (spec 004 §14 A5's brand voice). `seed/copy.ts` holds all of these as
  functions so `pnpm seed:check` and the unit suite share one definition.
- **No copy states delivery timing** (spec 006 §14 A4). No lead time, no "next day" or "same day",
  no working-day count, no punctuality promise: no such data exists (`src/config/countries.ts`
  deliberately carries no `delivery_days`) and the cutoff and next-available-date sentence is spec
  009's server-rendered per-country block. Copy may only point at it — "order by the cutoff shown
  for the destination". `DELIVERY_TIMING_PATTERN` in `seed/copy.ts` is the check, asserted over
  every locale in `tests/unit/seed-copy.test.ts`.

The operational runbook (edit a product, add a country's prices, read a diff, re-seed safely) is
`docs/runbooks/seed-catalogue.md`, written in TASK-081.
