# Runbook: the seed catalogue (edit, gate, diff, re-seed)

| Field         | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| Severity      | P2 (a wrong product row or price reaches every page that lists it)                 |
| Detect        | `pnpm seed:check`, `pnpm seed:diff`, `pnpm catalogue:check`, a red unit suite       |
| Owner         | founder                                                                            |
| Owning spec   | 006 (`specs/006-seed-catalogue-import-imagery-pipeline.md` §2.7); tables are 002's |
| Last tested   | 2026-10-25: §3 and §4 run with `DATABASE_URL` unset (TASK-081); §5 not yet          |

The procedures for changing the catalogue dataset and putting it into a database. The reference
material (every file, every rule family, every diff column) is `seed/README.md`; prices have their
own runbook, `docs/runbooks/pricing.md`; imagery has `docs/runbooks/imagery.md`. This file is the
order of operations.

**Where the truth is, in one line each (ADR-0017).**

- Products, tiers, categories, occasions, add-ons and prices are **authored** in
  `src/config/catalogue/*.data.ts`. The matching files under `seed/data/` are **projections** and
  are never edited by hand: `pnpm seed:project` writes them.
- Catalogue copy is authored in `seed/data/copy/en/*.json` (`en-gb` holds only its overrides;
  `de`/`pl` are machine drafts from `pnpm i18n:draft`).
- Imagery rows, alt text and the occasion calendar are authored in their own `seed/data/` files
  (`media.json`, `alt/`, `occasion-country.json`).
- A destination is a row of `src/config/countries.ts`; its status (`live`, `demo`, `disabled`) is
  data.

Until spec 012b's catalogue cutover (TASK-294) these files are what the site renders. After it the
database is the master copy and the files remain the seed and the test fixtures.

---

## 1. Edit a product

1. Change the product in `src/config/catalogue/products.data.ts` (or its tier ladder in
   `tiers.data.ts`). For its words, change its row in `seed/data/copy/en/products.json`: 60 to 90
   words, ending with the shared local-florist sentence, no superlative from
   `BANNED_SUPERLATIVES`, no delivery-timing claim (`seed/README.md`, "Catalogue copy").
2. `pnpm seed:project` to rewrite the projected files. `pnpm seed:project --check` says whether
   anything is still stale without writing.
3. If the English copy changed, `pnpm i18n:draft --locale de` and `pnpm i18n:draft --locale pl`
   re-draft the German and Polish rows. A reviewed row is never overwritten; one whose English
   source moved is reported `stale`.
4. Run the gate (§3) and read the diff (§4). Then `pnpm seed:diff --write` and commit the snapshot
   with the change.
5. Run the unit suite for what moved. `tests/unit/seed-dataset.test.ts` fails a projection that
   was not regenerated and `tests/unit/seed-diff.test.ts` a snapshot that was not rewritten. The
   other generated fixtures that read the catalogue (the listing URL set, the sitemap fixtures)
   are rewritten by the generators `docs/codebase-map.md` lists.

A product added or removed also moves spec 006's counts (84 products in a 40/14/8/10/12 split,
`seed:check` family 2) and spec 008's listing existence (a category below six products in a
destination has no page). Both are deliberate gates: change the rule in the spec, not in the check.

## 2. Add a country's prices

A destination is priced exactly when it is `live` or `demo` in `src/config/countries.ts`, and
`src/config/catalogue/prices.data.ts` throws on first import if the two sets disagree.

1. Add or flip the country in `src/config/countries.ts`. Going `live` also needs an active florist
   (spec 007's `corridorState()`); a registry label alone opens nothing.
2. Add its `DESTINATION_PRICING` record (currency, VAT on flowers, the standard rate for add-ons,
   bands, ladders, surcharges, add-on prices) by `docs/runbooks/pricing.md` §1. Record the two VAT
   rates and their source in `docs/compliance/vat-rates.md`; a rate marked provisional blocks a
   `live` flip.
3. `pnpm catalogue:check`, then `pnpm seed:project`: the new `seed/data/prices/{ISO2}.json` and
   `addon-prices/{ISO2}.json` appear.
4. Add its rows to `seed/data/occasion-country.json` for the occasions it keeps, with the dates
   verified against an official calendar (`plan/13` D6).
5. Gate, diff, `--write`, commit (§3, §4).

## 3. Run the gate

```
pnpm seed:check            # exit 0, or one line per problem: file, [family/rule], key, message
pnpm seed:check --report   # also the catalogue-health report (coverage, prices, copy shares)
pnpm media:variants --check
pnpm catalogue:check
```

All four need no database and no network (spec 006 AC-1, asserted by
`tests/unit/seed-no-db-seam.test.ts`). Read a failure by its family: a `prices` or
`schema/stale-projection` line is fixed in `src/config/catalogue/*.data.ts` followed by
`pnpm seed:project`, never in the projected file; every other family is fixed in the file the line
names. The nine families are tabled in `seed/README.md`.

## 4. Read the diff

```
pnpm seed:diff             # the dataset against the committed snapshot; exit 1 on drift
pnpm seed:diff --all       # every changed row, not the first 25 per table
```

Check, in order:

1. **`conflicts` is 0.** A conflict is a `source = 'real'` row the run would otherwise change, or
   two rows claiming one natural key. It is always a failure.
2. **`updates` are the ones you meant.** Each prints `column: old -> new`, and a minor amount
   always prints beside its currency (`retail_minor: 15900 PLN -> 16900 PLN`).
3. **`orphans` are intended.** The importer never deletes; a product you removed from the dataset
   stays in a database until it is retired there.

Then `pnpm seed:diff --write`. The snapshot under `seed/snapshot/` stands in for the database until
TASK-083 adds the database target, which prints this same report.

## 5. Re-seed a database safely

```
pnpm db:migrate                         # the schema first
pnpm db:seed --dry-run                  # the run inside a rolled-back transaction: counts only
pnpm db:seed                            # upsert by natural key (not allowed in production)
pnpm db:seed --insert-only              # add what is missing, update nothing
pnpm db:seed --only=reference,geo,catalog,partners
```

- The connection is `DATABASE_URL_UNPOOLED`, from the process environment only. Never point a
  local shell at production by pasting a URL from `.env.local`.
- **Always `--dry-run` first** and compare its counts with `pnpm seed:diff`. A second real run must
  report `0 inserted, 0 updated`: the seed is idempotent, and anything else means the dataset or
  the database moved.
- **In production only `--insert-only` runs.** With `APP_ENV=production` a plain `pnpm db:seed`
  exits 1 before connecting, because putting a seeded value "back" there would overwrite the live
  catalogue (spec 012b §2.0 item 5).
- `--only` runs the named groups in dependency order; a group's parents must already be seeded.

## 6. What "never touch `source = 'real'`" means in practice

Every row the seed writes is `source = 'seed'`. A row becomes `real` when a person makes it real
in production: the founder edits a product in admin, a florist uploads a photograph, a country is
switched live. From then on:

- **The seed never updates or inserts it, in any mode.** A `real` row is counted `real` in the
  report and left byte for byte. So is every row under a `real` parent (a `real` product's
  translations, tiers, prices and media mappings; a `real` country's rows; a `real` florist's
  coverage): counted `under real`, neither updated nor inserted.
- **Fixing a `real` row is an admin edit, not a dataset edit.** Changing the dataset and
  re-seeding does nothing to it; once TASK-083's database target exists, `seed:diff` against the
  database reports the difference as a conflict rather than an update.
- **Turning a row back into `seed`** is a deliberate database change, never a seed flag: no
  `db:seed` option overrides `real` (`plan/10` §4).
- **A country's status is set once by the seed** (when the row is inserted) and from then on is
  admin's go-live flip. `pnpm catalogue:parity --target=<postgres url>` (read-only) reports a
  country whose database row disagrees with the registry.

## 7. Related

- `seed/README.md`: the file layout, the nine rule families, the diff columns, the copy rules.
- `docs/runbooks/pricing.md`: setting and superseding a price, stale FX, the 30-day lowest price.
- `docs/runbooks/imagery.md`: generating, reviewing and deriving photographs.
- `docs/runbooks/i18n-translations.md`: handing a machine-drafted locale to a native reviewer.
