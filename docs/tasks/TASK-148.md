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
  row's `amountMinor` changes the price every later caller reads, which is worse than truncation
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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

- 2026-10-02 `bc53a5d5`: the shared contract mutates the **returned** value of all nine reads. It
  is red on `main`'s providers, 19 of 19 mutation cases.
- 2026-10-02 `a5847916`: the fix in `src/modules/catalog/static/index.ts`. The contract has 27 of
  27 green, and the full unit and contract layers pass (208 files, 5,932 tests).
- 2026-10-02: 12 provider mutants and 2 type-level contract mutants run, each red where expected
  (below).

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
case, which truncated a copy, with 19 mutation cases plus one coverage case:
- per read, a row-field write (`name`, `isDefault`, `sort`, `sort`, `partnerOnly`, `retailMinor`,
  `retailMinor`, `ratePpm`, `enabled`) and a `.length = 1` truncation, both on the **returned**
  value;
- for products, emptying the row's nested `occasions` array as well.

Each case re-reads through the same provider and asserts the result `toStrictEqual`s a
`structuredClone` snapshot of the first read, at the exact row count the run states. A throw
(`TypeError` from a frozen value) and an absorbed write (a fresh copy per call) both pass, and the
re-read is asserted either way. The read table is typed from `CatalogProviders`, so a read missing
from it, or a field its row lacks, fails `typecheck`. `describeCatalogProviderContract()` now takes
`rowCounts`, and the static run passes 84 / 236 / 23 / 32 / 6 / 3332 / 42 / 9 / countries +
currencies (17), the same counts `tests/unit/catalog-barrel.test.ts` pins. Unit and contract
totals: 208 files, 5,932 passed, 5 skipped. The skips are pre-existing; none is in this diff.

**Mutation proof.** Each mutant was applied alone to `static/index.ts` and run against the static
contract (27 cases).

| Mutant | Red cases |
|---|---|
| M1 `products` hands out `PRODUCTS` | products `name`, products `occasions`, products truncation (+ cross-provider refs, collateral) |
| M2 `tiers` hands out `PRODUCT_TIERS` | tiers `isDefault`, tiers truncation (+ cross-provider refs) |
| M3 `categories` hands out `CATEGORIES` | categories `sort`, categories truncation |
| M4 `occasions` hands out `OCCASIONS` | occasions `sort`, occasions truncation |
| M5 `addons` hands out `ADDONS` | addons `partnerOnly`, addons truncation (+ cross-provider refs) |
| M6 `countryPrices` hands out `COUNTRY_PRICES` | countryPrices `retailMinor` (19901 ≠ 19900), countryPrices truncation (1 ≠ 3332) |
| M7 `addonCountryPrices` hands out `ADDON_COUNTRY_PRICES` | addonCountryPrices `retailMinor`, addonCountryPrices truncation |
| M8 `fxRates` hands out `FX_SNAPSHOT` | fxRates `ratePpm`, fxRates truncation |
| M9 `PHASE_0_FLAGS` left unfrozen | flags `enabled`, flags truncation |
| M10 rows writable, arrays frozen (the shallow-freeze trap) | all 9 row-field cases (+ one-default-tier, collateral) |
| M11 arrays writable at every depth, rows frozen | all 9 truncations + products `occasions` (+ one-default-tier) |
| M12 only nested arrays writable | products `occasions` only |
| C1 contract: `fx` target dropped from the table | `typecheck` TS1360 |
| C2 contract: `amountMinor` named for `addonCountryPrices` | `typecheck` TS2322 (the price field is `retailMinor`) |

**Carry-forward to TASK-070.** The mutation cases sit in the shared contract. When TASK-070 adds
`tests/contract/catalog-db-providers.test.ts`, it calls `describeCatalogProviderContract("db",
…, rowCounts)` with the exact counts of its seeded data, at least 2 per read. A DB provider passes
by returning fresh rows per query, or a frozen cache; a cached array it hands out unfrozen goes red.

**Observations, outside this fence.**
- `src/modules/ui/home/trending-provider.ts` (`productBySku`) and `src/modules/geo/corridor.ts`
  (`occasionByKey`) read dataset rows directly, not through a provider, so those rows are still
  writable.
- The contract's other cases still assert `> 0` / `> 10` at lines 226, 246, 404 and 412 of
  `catalog-provider-contract.ts`.

Neither was changed here.

**Gates.** `pnpm gates:cheap` block below.
