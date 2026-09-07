# Test fixtures

Shared, deterministic inputs for the test suites. One home per kind of fixture, so no two specs
invent their own copy of a currency or an occasion date (`CLAUDE.md` "Conventions": fixtures for
occasion dates, currencies and addresses are shared).

| Path | Contents | Owned by | Consumed by |
|---|---|---|---|
| `index.ts` | Typed barrel: `occasionDates`, `currencies`, `addresses`, `phones`. Typed and **empty** in spec 001 — the interfaces are the contract. | spec 001 (names/types), 002/003/005 (data) | unit, integration, e2e |
| `env/` | `valid.env`, `missing-key.env`, `extra-key.env` — `pnpm env:check` failure paths (AC-11 / T-12). | spec 001 | `tests/unit/env-check.test.ts` |
| `lint/` | Files that violate the `fo/*` rules on purpose, plus their logical/valid twins, and a mirrored `lint/src/` tree for the module-boundary zones (AC-4…AC-9). Excluded from `pnpm lint` (`globalIgnores`); linted by `pnpm lint:fixtures`. | spec 001 | `tests/unit/no-*.test.ts`, `tests/unit/module-boundaries.test.ts` |
| `ts/` | Type-level fixtures (e.g. `unchecked-index.ts`) checked with `tsconfig.fixtures.json` (AC-2 / T-02). Excluded from `pnpm typecheck`. | spec 001 | `pnpm typecheck:fixtures` |
| `seo/` | Sitemap, hreflang and JSON-LD fixtures plus `lighthouse-urls.json`, including deliberately bad ones (AC-22 / T-23). **Arrives with TASK-009**; spec 007 supplies the real set. | spec 001 (TASK-009) | `pnpm seo:validate`, `lighthouse` |

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
`pnpm test:visual --update-snapshots`).
