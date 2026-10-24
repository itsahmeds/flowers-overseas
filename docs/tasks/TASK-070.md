# TASK-070 — Database-backed catalogue providers: `src/modules/catalog/db/{catalogue,price,fx}.ts` with Drizzle queries behind the unchanged interfaces, the provider contract suite run against a migrated and seeded Postgres, the batched-query assertion and the zero-query-on-cache-hit assertion

Row: `TASKS.md` → TASK-070. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-070-db-catalogue-providers`. **Blocked on TASK-013** (spec 002 provisioning parked 2026-09-08 by the founder: no Neon project, no Cloudflare R2, waiting on the domain and business mailbox — `plan/09` §0 non-code critical path first). Nothing here is startable before TASK-013, TASK-014…TASK-016 (migrations `0001`–`0003`, which must carry the three spec 002 §14 A1 amendments) and TASK-026 (seed) are `done`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. **AC-27 is the seam's proof**: the `db*` providers pass the *same* contract suite as the `static*` ones against the same seeded dataset, and swapping the composition root changes **no file outside `src/modules/catalog`** — asserted by a diff-scope check in the PR. **AC-28** is a Neon compute-cost constraint as much as a performance one (ADR-0015): a query counter proves `resolvePrice` batches per (product, country) rather than per tier, and a warm ISR page performs **zero** queries (spec 002 §5.4). Gates: `lint`, `typecheck`, `test-unit`, `test-integration` (Postgres service job), `db:check`, `catalogue-check`, `build`. Tests: T-25 (db side), T-26.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `plan/09`
- `src/config/catalogue/*.data.ts`
- `src/modules/catalog`
- `tests/contract/support/catalog-provider-contract.ts`

## Carry-forwards

- **From `/review 56` (TASK-069):** fix `tests/contract/support/catalog-provider-contract.ts` ~L139 (`mutable.length = 1` truncates a copy, so the not-shared assertion cannot fail) before the Drizzle half reuses the suite; add an emit test for `catalog.price_ambiguous`; `checkSurchargeVatRates` baseline is last-wins over superseded retail rows.

- **From `/review 132` and `/break 132` (2026-10-02, TASK-148), binding:** run
  `describeCatalogProviderContract("db", …, rowCounts)` with exact seeded counts of at least 2 per
  read. Before that run lands, `emptyInPlace` (`tests/contract/support/catalog-provider-contract.ts`)
  overwrites one element of each nested array and calls `reverse()` on it, each through its own
  `attempt()` (skip the reverse where the first element equals the last), **before** `length = 0`.
  It must go red under H4a (nested arrays sealed) and H4b (only nested `length` non-writable).
  A follow-up rides with this task: `ui/home/trending-provider.ts` and `geo/corridor.ts` read
  dataset rows directly. Route both through the catalog barrel, or freeze the dataset at its own
  source, and check spec 005's AC-2 graph rule against them. It rides here because TASK-070 is
  the next task to touch the catalog's data-source seam, and under "visible first" (2026-10-03) no
  hardening task opens before then.
- **From `/plan-tasks` (orchestrator, 2026-10-20):** unblocked: TASK-069 and TASK-013 are done. Spec 012b's cutover (TASK-292, TASK-294) builds on these providers (spec 012b §12, requirement on spec 005), so this task now has its consumer.

- **TASK-294:** select `dbCatalogueProvider` / `dbPriceProvider` by environment in
  `catalogProviders()`; prove a warm ISR page performs zero queries through `next start` (E3);
  route `ui/home/trending-provider.ts`'s product name through the barrel (E5); keep the static FX
  provider until TASK-071 writes `fx_rate` rows.
- **TASK-297:** the product editor writes the `en` `product_translation` in the same transaction as
  the product: a product without it makes the database catalogue read fail closed.
- **Orchestrator:** a spec 002 §5.1 amendment naming `0025`'s four columns (E1).
- **Later:** a price read scoped to one (product, country) needs an interface change; reconsider
  if `country_price` grows past a few tens of thousands of rows.
- From `/review 56`: the `catalog.price_ambiguous` emit test is added here
  (`tests/unit/catalog-logging.test.ts`, red with the signal removed); `checkSurchargeVatRates`'
  last-wins baseline over superseded retail rows is a `catalogue:check` gate change outside the
  providers and stays open.

## Escalations

Rulings made by the implementer on 2026-10-22 under the orchestrator's order ("follow the spec
text and record the ruling, then continue"); none is about money, so none blocks.

- **E1, schema gap (ruled: migration `0020_product_facets`).** Spec 005 AC-27 needs the database
  provider to hand over the same `ProductData` as the static one, and spec 012b §2.2 makes the
  database the only runtime source of "products, tiers, facets". Spec 002 §5.1's `product` row
  holds only the *primary* flower and colour; the other flower types (30 products), the other
  colours (14), the allergen attribute (4 gift sets) and the order of a product's occasions had no
  column, and the seed never wrote `product_occasion` at all. Neither spec 005 nor spec 012b's
  slice A migrations list the change. Ruling: `0020_product_facets` (number after PR 320's `0019`,
  as the work order allows; renumbered `0025_product_facets` on 2026-10-24 by the coordinator, since `0019`..`0024` are
  claimed by PRs 383, 384, 326, 320 and the blog PR 394; PR 307 has no migration) adds `product.other_flowers text[]`, `product.other_colours text[]`,
  `product.allergen_note boolean` (defaults `'{}'`, `'{}'`, `false`; a check refuses the primary
  among the others) and `product_occasion.sort`; the seed writes them and the `product_occasion`
  edges; a one-time backfill fills rows the seed already wrote (`source = 'seed'` and all three
  still at their defaults only), because a production seed is `--insert-only` (spec 012b AC-1) and
  could never fill them. Spec 002 §5.1 should gain the four columns by amendment (orchestrator).
- **E2, definitions (ruled: repository).** `category`, `occasion` and `addon` carry keys only, not
  the `sort`, label key, flag prefix or `partnerOnly` a definition is made of, and spec 012b §2.2
  keeps "add-on and category and occasion definitions" in the repository. So
  `dbCatalogueProvider.categories/occasions/addons` hand over the static provider's frozen rows.
- **E3, AC-28 behind an unchanged interface (ruled: one statement per read, once per request).**
  `PriceProvider.countryPrices()` takes no argument, so a query cannot be scoped to one (product,
  country) without changing the interface the brief says is unchanged. Each read is one `SELECT`
  over its table, kept in the request's read scope (React `cache()`), so pricing a product is one
  `country_price` query whatever its tier count and a listing of every card is the same one query:
  never one per tier. A cached ISR page renders nothing and so reads nothing; the providers issue
  no query at import or construction. The end-to-end "warm page through `next start`, zero
  queries" needs the composition root to select the database, which is TASK-294's (carry-forward).
- **E4, the composition root (ruled: not switched here).** Spec 012b AC-3 gives the by-environment
  selection to TASK-294. This task adds `withCatalogProviders()` (module-internal, not in the
  barrel) so the suite prices through the module with the root swapped inside
  `src/modules/catalog`; the PR's diff touches no file under `src/` outside `src/modules/catalog`.
- **E5, the `/review 132` follow-up (checked).** `ui/home/trending-provider.ts` reads one product's
  `name`; `geo/corridor.ts`, `ui/product/DateChip.tsx` and `ui/product/PriceSummary.tsx` read an
  occasion's `labelKey`. None hands out a dataset row or array, so TASK-148's mutation defect
  cannot arise through them. Occasion definitions stay in the repository under spec 012b §2.2, so
  those three are correct for good; the product name becomes database-owned at the cutover, so the
  trending row must read it through the barrel then (carry-forward to TASK-294).

## Progress

- 2026-10-22: worktree on `task/TASK-070-db-catalogue-providers`; contract `emptyInPlace` now overwrites and reverses a nested array before truncating it (red under H4a sealed and H4b non-writable `length`, green before). Next: migration `0020_product_facets`, the `db/` providers, the Postgres contract run.
- 2026-10-22: `src/modules/catalog/db/{read,catalogue,price,fx,index}.ts`, `frozen.ts`, migration `0020_product_facets` (+ down), seed writes the facets and `product_occasion`; `tests/integration/catalog-db-providers.test.ts` 65/65 green on a local PG16 (with PR 320's `0019` present), seven mutations each red. Next: rebase on PR 320, cheap gates, ready + `ci:full`.
- 2026-10-22 (time limit, **partial**): branch pushed at `ace0d5d4`, draft PR #324 with the full
  `## Self-review` in its body. Everything is built and tested; only the hand-off steps remain,
  and they wait on **PR 320 (TASK-293, migration `0019`) merging**: until it does, `0020` leaves a
  version gap, so `db:check` and three unit files (`db-migrate`, `db-check`,
  `db-check-recipient-email`) fail on this branch alone. Proven green on a local merge with PR 320:
  those unit files, `no-db-imports`, `url-pii`, `rls-policies`, and integration `catalog-db-providers`,
  `seed`, `seed-insert-only`, `build-role`, `migrations-round-trip`, `schema-catalog-pricing`,
  `db-check-live`. **A finisher's steps, in order:**
  1. `git fetch origin && git rebase origin/main` once PR 320 is on `main`. Expected conflicts:
     `scripts/check-no-db-imports.ts` (keep all three adapter dirs: `src/modules/geo/db`,
     `src/modules/i18n/db`, `src/modules/catalog/db`); `tests/unit/no-db-imports.test.ts` (expect
     those three; add `src/modules/i18n/db/attest.ts` to the adapter-file loop);
     `tests/unit/db-migrate.test.ts` (list `0019_review_attestation.sql` then
     `0020_product_facets.sql`); `docs/codebase-map.md` (regenerate: `node scripts/codebase-map.ts`).
  2. Regenerate `scripts/db-check.snapshot.json` against a freshly migrated local database:
     `DATABASE_URL_UNPOOLED=<local scratch db> node scripts/db-migrate.ts`, then
     `… node scripts/db-check.ts --write-snapshot` (adds the 7 lines for `0020`'s three checks and
     four defaults; `db-check-live` fails without it).
  3. `pnpm gates:cheap`, push, `gh pr ready 324`, `gh pr edit 324 --add-label ci:full`; set the
     TASKS.md row to `in_review` with the PR link.
- 2026-10-24 (finisher): rebased on `origin/main` (`692a24b5`), codebase map regenerated at each
  conflict; migration renumbered `0026_product_facets` per the work order; `db-check.snapshot.json`
  regenerated (+7 lines: three checks, four defaults) on a scratch PG16; the carry-forwards heading
  fix clears CI's `tasks-open-decisions` lint failure. On a scratch PG16 with uncommitted empty
  `0019`..`0025` placeholders: integration 138/138 (eight files), mutations M1-M7 each red again.
  **Until `0019`..`0025` are on `main`, `db:check` reports a version gap**, so CI's `db-check`, and
  every job that runs `db:migrate`, plus 11 unit cases (`db-check`, `db-check-recipient-email`,
  `db-migrate`'s list) stay red on this branch alone; after they merge: rebase, regenerate the
  snapshot, add the seven predecessors to `db-migrate.test.ts`'s list, re-fire `ci:full`.
- 2026-10-24 (finisher, coordinator's correction): renumbered `0025_product_facets`; the blog PR 394
  holds `0024` and PR 307 has no migration. The gap now closes when PRs 383, 384, 326, 320 and 394
  merge; the follow-up (rebase, `db-migrate.test.ts` list, snapshot, `ci:full`) is unchanged.

## Result

PR [#324](https://github.com/itsahmeds/flowers-overseas/pull/324). AC-27 and AC-28 met; the PR's
`## Self-review` carries the AC table, the ten mutations (each red) and the money edge cases.

- **Delivered:** `src/modules/catalog/db/{read,catalogue,price,fx,index}.ts`;
  `src/modules/catalog/frozen.ts` (shared deep freeze); `withCatalogProviders()` in `providers.ts`;
  migration `0025_product_facets` (+ down) and its Drizzle mirror; the seed writes the facet columns
  and `product_occasion`; `check:no-db` leaves `src/modules/catalog/db` out; the contract's
  `emptyInPlace` fix; the pricing runbook §3.1.
- **Tests:** integration `catalog-db-providers` (65: the shared contract with exact seeded counts,
  row-for-row and priced-output equality, the build login, the query counter, the FX-missing,
  unsafe-integer and missing-name edges, the backfill); unit `catalog-db-read` (12), `catalog-logging` (+1, `catalog.price_ambiguous`),
  `catalog-barrel` (+1 and the `db/` file list), `no-db-imports` (the catalogue adapter dir).
- **Local runs:** PG16 (embedded, scratch, stopped by `pg_ctl stop`); the expensive gates are CI's.
