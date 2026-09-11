# Test fixtures

Shared, deterministic inputs for the test suites. One home per kind of fixture, so no two specs
invent their own copy of a currency or an occasion date (`CLAUDE.md` "Conventions": fixtures for
occasion dates, currencies and addresses are shared).

| Path | Contents | Owned by | Consumed by |
|---|---|---|---|
| `index.ts` | Typed barrel: `occasionDates`, `currencies`, `addresses`, `phones`. Typed and **empty** in spec 001 — the interfaces are the contract. `currencies` filled by spec 003 (TASK-036) with the money-formatting matrix, `addresses` and `phones` by spec 003 (TASK-037: PL/DE/AT/GB + generic blocks and postcode rejections; phone rows are data only until spec 010 validates them); `occasionDates` still awaits spec 002/009. | spec 001 (names/types), 002/003/005 (data) | unit, integration, e2e |
| `catalogue.ts` | The shared catalogue/pricing corpus of spec 005 §2. Created by TASK-066 with the **hand-computed FX table** AC-12 asserts against (`PLN→GBP` via the euro cross, `PLN→EUR` inverse, `EUR→PLN` published; buffered and displayed amounts per row, with the longhand arithmetic in the file header). **TASK-069 owns the file** and adds the `plan/10` §2.3 band table, the mixed-VAT basket and the export from `index.ts`. | spec 005 (TASK-066 FX table, TASK-069 the rest) | `tests/unit/catalog-pricing-fx.test.ts`; 008/009/010/013/018 from Phase 1 |
| `env/` | `valid.env`, `missing-key.env`, `extra-key.env` — `pnpm env:check` failure paths (AC-11 / T-12). | spec 001 | `tests/unit/env-check.test.ts` |
| `lint/` | Files that violate the `fo/*` rules on purpose, plus their logical/valid twins, and a mirrored `lint/src/` tree for the module-boundary zones (AC-4…AC-9). Excluded from `pnpm lint` (`globalIgnores`); linted by `pnpm lint:fixtures`. | spec 001 | `tests/unit/no-*.test.ts`, `tests/unit/module-boundaries.test.ts` |
| `ts/` | Type-level fixtures, each of which **must fail** `tsconfig.fixtures.json`: `unchecked-index.ts` (strict flags, AC-2 / T-02), `format-time-in-zone-no-zone.ts` (the required IANA zone on `formatTimeInZone`/`formatDate`, spec 003 AC-17 / T-17). Excluded from `pnpm typecheck`. | spec 001, spec 003 (TASK-036) | `pnpm typecheck:fixtures`, `tests/unit/i18n-format.test.ts` |
| `seo/{sitemap,hreflang,schema}/` | The directories `pnpm seo:validate` reads. Empty (`.gitkeep`) in spec 001, so the validators printed `no fixtures` and exited 0; `schema/` carries `pdp-product-offer.json` from TASK-069 (`/review 52`) — one real `offerProjection()` graph, regenerated and compared by `catalog-offer-schema-identity.test.ts`, so the price-identity gate is no longer vacuous. Spec 007 supplies the full set. | spec 001 (TASK-009), spec 005 (TASK-069) | `pnpm seo:validate` |
| `seo/_cases/` | Deliberately bad (and matching good) validator inputs: `bad-nonreciprocal.json`, `bad-price-mismatch.json`, `bad-forbidden-type.json`, `bad-sitemap-*.xml`, `good-*` (AC-22 / T-23). Kept **outside** the three directories above and copied into a temp directory by the tests, so a crashed test can never leave a broken fixture in the tree. Prettier-ignored (some are malformed on purpose). | spec 001 (TASK-009) | `tests/unit/seo-validate-*.test.ts` |
| `i18n/_cases/` | Deliberately faulty catalogue sets for `pnpm i18n:check` (spec 003 AC-22 / T-22): one directory per seeded fault (`missing-key`, `unused-key`, `icu-syntax`, `argument-mismatch`, `redundant-override`, `missing-meta`, `stale-hash`) plus `clean`, each holding a miniature `en`/`de`/`en-gb` catalogue, its review manifests and a `src/usage.ts` consumer; and five locale registries for the `pathSegments` rules (`registry-valid.json` plus the uppercase, non-ASCII, trailing-slash and duplicate malformations, AC-13 / T-13). Passed to the CLI with `--messages-dir`/`--src`/`--registry`, so the committed catalogues are never mutated to prove a failure. Prettier-ignored (an unclosed ICU brace is the point). | spec 003 (TASK-040) | `tests/unit/i18n-check.test.ts` |
| `seed/_cases/prices/` | Six per-country price files for spec 006 AC-6 / T-06: `good-pl-block.json` (the real `FO-BQ-001` block in PL — three tier rows, the open-ended Sunday row, two closed peak-day windows) and five copies of it with **exactly one** fault each — `bad-out-of-band.json`, `bad-float-amount.json`, `bad-wrong-ending.json`, `bad-second-open-ended.json`, `bad-unknown-tier.json`. Valid JSON on purpose (a float amount and a second open-ended row must reach a schema to be rejected), so the formatter owns them. Wired into `pnpm seed:check` by TASK-075. | spec 006 (TASK-074) | `tests/unit/seed-prices.test.ts`, `pnpm seed:check` |
| `seo/lighthouse-urls.json` | The paths the `lighthouse` CI job measures, root-relative (`["/", "/en", "/de"]` since spec 003 TASK-043; spec 004 §2 extends it to all four launch locales). Joined to the preview URL by `scripts/seo/lighthouse-urls.ts`; budgets live in `lighthouserc.json` (AC-23 / T-24). | spec 001 (TASK-009), 003 (TASK-043), 004/007 (real URL set) | `pnpm lighthouse`, `tests/unit/lighthouse-budgets.test.ts` |

Rules of the house:

- **Deterministic.** No `Date.now()`, no random values, no network. Occasion dates are ISO
  `YYYY-MM-DD` strings, never `Date` objects, so a fixture cannot drift with the runner's
  timezone.
- **Money in minor units.** `amount_minor` + ISO 4217 code, never a float (`plan/12` §2,
  `fo/no-float-money`).
- **Synthetic personal data only.** Names, addresses, phones and emails are invented; no
  customer, recipient or partner data ever lands here (`plan/07`, `CLAUDE.md`).
- **Bad fixtures are explicit.** A fixture that must fail validation says so in its name
  (`bad-*`, `missing-*`, `extra-*`) or with `invalid: true`.

Related directories that are *not* fixtures: `tests/msw/` (request handlers and the node server),
`tests/visual/__screenshots__/` (committed visual baselines, regenerated with
`pnpm test:visual --update-snapshots`), and `tests/dev-os/` (shell checks for the PreToolUse
guard, `task.sh` and the Stop hook — AC-24…AC-26, run by `pnpm dev-os:check`). The dev-OS checks
build their own throwaway `TASKS.md` and `.claude/state/` in a temp directory rather than taking a
fixture from here, because they must never read or write the real repository's active-task pointer:
see `tests/dev-os/README.md`.
