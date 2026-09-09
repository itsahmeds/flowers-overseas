# `seed/` — the catalogue dataset and the scripts that read it

Owned by spec 006 (`specs/006-seed-catalogue-import-imagery-pipeline.md`); the tables and the
upsert plumbing are spec 002's. Two directories and one rule.

## The rule: never hand-edit a projected file

`seed/data/` holds two kinds of file, and every file says which kind it is in its own header:

| `origin` | Files | Who edits them |
|---|---|---|
| `projected` | `taxonomy.json`, `categories.json`, `occasions.json`, `products.json`, `product-tiers.json`, `addons.json`, `prices/{ISO2}.json`, `addon-prices/{ISO2}.json` | **Nobody.** Edit `src/config/catalogue/*.data.ts` and run `pnpm seed:project` |
| `authored` | `occasion-country.json` (and, from TASK-073/077/078, `copy/`, `media.json`, `media-variants.json`, `alt/`) | A human, in the file — except `media-variants.json`, which `pnpm media:variants` writes |

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
```

`seed/data/prices/{ISO2}.json` and `seed/data/addon-prices/{ISO2}.json` exist once per **priced
destination** — the `live` and `demo` countries of `src/config/countries.ts`, seven of them. The
eighth seeded country of `plan/10` §2.1 is the UK, which is the first *buyer* market (ADR-0002)
and not a place we deliver to, so it has no price file: a row there would price nothing.

The deliberately faulty price files `pnpm seed:check` is tested against —
out-of-band, float amount, wrong psychological ending, a second open-ended row, an unknown tier,
plus the matching good block — live in `tests/fixtures/seed/_cases/prices/` (spec 006 AC-6).

`seed/check.ts` (`pnpm seed:check`, TASK-075), `seed/diff.ts` (`pnpm seed:diff`, TASK-076),
`seed/media-variants.ts` (TASK-078), `seed/index.ts` (`pnpm db:seed`, TASK-083) and
`seed/upload.ts` (TASK-082) join them in the tasks named.

## Facts worth knowing before you edit anything

- **No database, no network, no clock.** `seed/schema/**` and `seed/project.ts` are covered by
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

The operational runbook (edit a product, add a country's prices, read a diff, re-seed safely) is
`docs/runbooks/seed-catalogue.md`, written in TASK-081.
