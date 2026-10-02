# TASK-148 — Price provider immutability: `staticPriceProvider.countryPrices()` returns its module-level array unfrozen, so a caller's `.length = 1` truncates every later read (3,332 rows → 1); return a frozen or copied value, and make the shared provider contract case mutate the **returned** value so it can fail — proved by mutation on both providers the contract runs

Row: `TASKS.md` → TASK-148. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-148`; keep it current by editing this file, not the row.

## Binding

- **The defect (TASK-143 escalation, 2026-09-23).** `staticPriceProvider.countryPrices()` returns
  its module-level array, unfrozen. A caller doing `.length = 1` truncates every later read, from
  3,332 rows to 1. Prices are money, and CLAUDE.md requires that the price shown is the price
  charged; a provider that any caller can corrupt breaks that for every later request in the
  process.
- **The test that should have caught it cannot fail.** The shared provider contract case mutates a
  *copy*. Make it mutate the value the provider **returned**, then read again and assert the second
  read is unchanged. Prove this on **both** providers the contract runs: remove the freeze or copy
  and the case goes red on each. Assert exact row counts, not `> 0`.
- **Widened by `/review 99` (2026-09-23): all nine static reads.** Catalogue, price, add-on
  price, FX and flags all hand out module arrays unfrozen, **with unfrozen rows**. Mutating one
  row's `retailMinor` changes the price every later caller reads, which is worse than truncation
  because it is silent. Freeze deeply, rows included, or copy per call, across all nine. The
  contract mutates both the returned array (`.length`) and a row field, then re-reads. Run it
  against **TASK-070's DB providers** as well as the static ones, so both implementations are
  held to the same promise.
- **Fix in the provider, not at the callers.** Return a frozen value (`Object.freeze` deep enough
  for the rows) or a fresh copy per call. If you copy, say why in `## Result`, and note the cost at
  3,332 rows. Callers must not need to change. If one does, escalate.
- **Money, so a full `/review`.** Implementer gates are in `CLAUDE.md` §Definition of done.

## Read

- `specs/005-catalogue-pricing-module.md`: `## 0. Index` first, then §2 (the providers and the
  static dataset) and the providers' contract in §5. Money rules: `CLAUDE.md` "Non-negotiable rules".
- `docs/codebase-map.md`: the `catalog` module row.
- `src/modules/catalog/static/index.ts` (the static providers), `src/modules/catalog/providers.ts`
  (the interfaces), `src/config/catalogue/prices.data.ts`.
- `tests/contract/support/catalog-provider-contract.ts` and
  `tests/contract/catalog-static-providers.test.ts` (the shared contract and its static run).
- TASK-070's DB providers do not exist yet: TASK-070 is `blocked` on TASK-013's provisioning. The
  case goes in the shared contract so that it runs against them the day TASK-070 adds its run.
  Record that in `## Result` as a carry-forward to TASK-070. Do not build a DB provider here.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

- **From `/review 132` round 1 and `/break 132` round 1 (2026-10-02): PASS on the shipped code; FAIL
  on three contract holes (`3648df41`).** All are in `tests/contract/support/catalog-provider-contract.ts`.
  No source change is expected; if one is needed, escalate.
  1. Hole 1: on every row, empty every array or object field, then re-read. Pin the nested fields
     per read: products have exactly `colours`, `flowerTypes` and `occasions`, and every other
     read has none. Red under H1, a products freeze that covers `occasions` only.
  2. Hole 2: for each read, through `attempt()`, replace a row
     (`handed[0] = { ...handed[0], [field]: changed }`) and `reverse()` the returned array in place.
     Re-read and assert the exact count and `toStrictEqual(before)`. Red under H2a (arrays sealed)
     and H2b (`length` made non-writable).
  3. Hole 3: write the field on every row, and hole 1's nested writes on every row, each through
     `attempt()`, then re-read with `toStrictEqual(before)`. Red under H3, where the last
     `countryPrices` row is left writable.

  Add H1, H2a, H2b and H3 with their red cases to `## Result`'s mutation table. The shipped
  providers stay green. Nits, optional while the file is open: exact counts in place of the
  `> 0` / `> 10` checks at contract lines 226, 246, 404 and 412; `amountMinor` → `retailMinor` in
  the brief; drop the row's stale sentence "The contract case mutates a copy and can never fail
  today". Carried to TASK-070: run `describeCatalogProviderContract("db", …, rowCounts)` with exact
  seeded counts of at least 2 per read. Carried to a later task: `ui/home/trending-provider.ts` and
  `geo/corridor.ts` read dataset rows directly; route them through the catalog module, or freeze
  the dataset at its source.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-02 `b39a8bb7` (was `bc53a5d5` before the rebase): the shared contract mutates the
  **returned** value of all nine reads. It is red on `main`'s providers, 19 of 19 mutation cases.
- 2026-10-02 `f03aa2ff` (was `a5847916`): the fix in `src/modules/catalog/static/index.ts`. The
  contract has 27 of 27 green, and the full unit and contract layers pass (208 files, 5,932 tests).
- 2026-10-02: 12 provider mutants and 2 type-level contract mutants run, each red where expected.
- 2026-10-02 `ff07308d`, round 2 (on `origin/main` `b56c59f7`): `/break 132`'s three holes closed
  in the contract, with no source change. The contract has 54 of 54 green. H1, H2a, H2b and H3 each
  pass the round-1 contract and fail this one.

## Result

**PR [#132](https://github.com/itsahmeds/flowers-overseas/pull/132).**

**What changed.** All nine static reads now hand out a **deep-frozen** value: the array, every row,
and every nested array inside a row. That covers `products`, `tiers`, `categories`, `occasions`,
`addons`, `countryPrices`, `addonCountryPrices`, `fxRates` and `flags`. The fix lives in
`src/modules/catalog/static/index.ts` alone. `providers.ts`, every caller and every type a caller
sees are unchanged, and no caller sorts, splices or writes a returned value.

**How it is built.** A private `deepFrozenCopy()` copies each dataset array once, at module load,
and freezes it at every depth. `PHASE_0_FLAGS`, which this file owns, is frozen where it is built.
Every call then returns the same frozen reference, so a read costs nothing per call. The helper
throws at load on a function or a non-plain object, because a frozen `Date`, `Map` or class
instance stays writable inside.

**Why copy once rather than freeze in place.** The `src/config/catalogue/*.data.ts` exports are
also read directly by `scripts/`, `seed/` and two `src/` call sites. Freezing them from the provider
would make their mutability depend on whether this module had been imported first, and the dataset
is outside this task's fence.

**Cost at 3,332 rows** (`price.countryPrices`). Measured in vitest at load average 7.04, with other
agents running:

| Approach | Cost |
|---|---|
| One-time deep-frozen copy (shipped) | 3.6 ms cold, 2.5 ms median, once per process; nothing per call |
| `structuredClone` per call (rejected) | 2.4 ms on every call; `resolvePrice` reads the table on each resolution |
| Shallow row copy per call (rejected) | 0.09 ms, but leaves `occasions` and other nested arrays shared |

**Tests (contract layer).** `tests/contract/support/catalog-provider-contract.ts` replaces the old
case, which truncated a copy, with 46 mutation cases and one coverage case. Each read gets these
cases, all on the **returned** value:
- **nested-field pin:** every row carries exactly the read's pinned nested fields. Products have
  `colours`, `flowerTypes` and `occasions`; every other read has none. (Round 2, hole 1.)
- **field on every row:** one scalar field written on **every** row (`name`, `isDefault`, `sort`,
  `sort`, `partnerOnly`, `retailMinor`, `retailMinor`, `ratePpm`, `enabled`). (Round 2, hole 3.)
- **nested on every row:** for products, every array or object field emptied on every row. (Round 2,
  holes 1 and 3.)
- **replace a row:** `handed[0] = { ...handed[0], [field]: changed }`. (Round 2, hole 2.)
- **reverse in place:** `reverse()` on the returned array. (Round 2, hole 2.)
- **truncate:** `.length = 1`.

Every single write goes through its own `attempt()`, so a refused write cannot hide a later row
that would have accepted one. Each case re-reads through the same provider and asserts the exact
row count plus `toStrictEqual` against a `structuredClone` snapshot of the first read. A throw
(`TypeError` from a frozen value) and an absorbed write (a fresh copy per call) both pass, and the
re-read is asserted either way.

The read table is typed from `CatalogProviders`, so a read missing from it, or a field its row
lacks, fails `typecheck`. `describeCatalogProviderContract()` takes `rowCounts`, and the static run
passes 84 / 236 / 23 / 32 / 6 / 3332 / 42 / 9 / 17 (countries + currencies), the same counts
`tests/unit/catalog-barrel.test.ts` pins. Round 2 also replaced the contract's four `> 0` / `> 10`
checks:
- the parse, price and flag cases now assert those exact counts;
- the buyer-dimension case asserts that the walked key set is exactly the dataset schemas' own
  columns.

The contract runs 54 cases, all green. The round-1 unit and contract totals were 208 files, 5,932
passed and 5 skipped; the skips are pre-existing and none is in this diff.

**Mutation proof.** Each mutant was applied alone to `static/index.ts` and run against the static
contract (54 cases, round 2). "Its cases" means that read's field-on-every-row, replace, reverse and
truncate cases.

| Mutant | Round-1 contract | Round-2 contract: red cases |
|---|---|---|
| M1 `products` hands out `PRODUCTS` | red | its cases + products nested (+ cross-provider refs, collateral) |
| M2 `tiers` hands out `PRODUCT_TIERS` | red | its cases (+ cross-provider refs) |
| M3 `categories` hands out `CATEGORIES` | red | its cases |
| M4 `occasions` hands out `OCCASIONS` | red | its cases |
| M5 `addons` hands out `ADDONS` | red | its cases (+ cross-provider refs) |
| M6 `countryPrices` hands out `COUNTRY_PRICES` | red | its cases |
| M7 `addonCountryPrices` hands out `ADDON_COUNTRY_PRICES` | red | its cases |
| M8 `fxRates` hands out `FX_SNAPSHOT` | red | its cases |
| M9 `PHASE_0_FLAGS` left unfrozen | red | its cases (+ flag scopes, collateral) |
| M10 rows writable, arrays frozen (shallow freeze) | red | all 9 field-on-every-row cases (+ one-default-tier) |
| M11 arrays writable at every depth, rows frozen | red | all 9 replace, all 9 reverse, all 9 truncate, products nested (+ 2 collateral) |
| M12 only nested arrays writable | red | products nested only |
| **H1** products freeze covers `occasions` only | **green, 27/27** | products nested only |
| **H2a** arrays `Object.seal`ed, not frozen | **green, 27/27** | all 9 replace + all 9 reverse (+ one-default-tier) |
| **H2b** array `length` non-writable, elements writable | **green, 27/27** | all 9 replace + all 9 reverse (+ one-default-tier) |
| **H3** last `countryPrices` row left writable | **green, 27/27** | `price.countryPrices()` field on every row only |
| C1 contract: `fx` target dropped from the table | `typecheck` TS1360 | `typecheck` TS1360 |
| C2 contract: `amountMinor` named for `addonCountryPrices` | `typecheck` TS2322 | `typecheck` TS2322 |
| C3 contract: `colours` dropped from the products pin | n/a | products nested-field pin only |

"(+ …)" marks collateral reds: a write that landed corrupted the shared data a later case reads.

**Carry-forward to TASK-070.** The mutation cases sit in the shared contract. When TASK-070 adds
`tests/contract/catalog-db-providers.test.ts`, it calls `describeCatalogProviderContract("db",
…, rowCounts)` with the exact counts of its seeded data, at least 2 per read. A DB provider passes
by returning fresh rows per query, or a frozen cache; a cached array it hands out unfrozen goes red.

**Observation, outside this fence.**
- `src/modules/ui/home/trending-provider.ts` (`productBySku`) and `src/modules/geo/corridor.ts`
  (`occasionByKey`) read dataset rows directly, not through a provider, so those rows are still
  writable.

This was not changed here. `/review 132` carried it to a later task: route those reads through the
catalog module, or freeze the dataset at its source.

**Gates.** `pnpm gates:cheap` on the clean, rebased tree (`643113f4`; the only later commit is
this docs edit). No expensive gate was run locally, and the build slot was not taken.

```text
gates:cheap · 643113f404a08f5b731311dfd9f363742e40fa2e · tree clean · base origin/main · 2026-10-02T15:57:29.332Z
typecheck             exit 0 · 1.9 s
lint                  exit 0 · 12.0 s
format:check          exit 0 · 7.7 s
i18n:check            exit 0 · 0.3 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 18.4 s · changed 28 + map 0 + always 3 · always run: zod-boundaries, lint-coverage, url-pii
format:check covers: every path except node_modules/ .next/ out/ coverage/ playwright-report/ test-results/ pnpm-lock.yaml next-env.d.ts .claude/ plan/ specs/ docs/ README.md TASKS.md CLAUDE.md /tests/fixtures/lint/ /tests/fixtures/seo/_cases/ /tests/fixtures/i18n/_cases/ /src/modules/geo/content/corpus.generated.ts
RESULT: PASS
```
