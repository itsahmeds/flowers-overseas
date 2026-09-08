# Test fixtures

Shared, deterministic inputs for the test suites. One home per kind of fixture, so no two specs
invent their own copy of a currency or an occasion date (`CLAUDE.md` "Conventions": fixtures for
occasion dates, currencies and addresses are shared).

| Path | Contents | Owned by | Consumed by |
|---|---|---|---|
| `index.ts` | Typed barrel: `occasionDates`, `currencies`, `addresses`, `phones`. Typed and **empty** in spec 001 — the interfaces are the contract. `currencies` filled by spec 003 (TASK-036) with the money-formatting matrix; the other three still await their spec. | spec 001 (names/types), 002/003/005 (data) | unit, integration, e2e |
| `env/` | `valid.env`, `missing-key.env`, `extra-key.env` — `pnpm env:check` failure paths (AC-11 / T-12). | spec 001 | `tests/unit/env-check.test.ts` |
| `lint/` | Files that violate the `fo/*` rules on purpose, plus their logical/valid twins, and a mirrored `lint/src/` tree for the module-boundary zones (AC-4…AC-9). Excluded from `pnpm lint` (`globalIgnores`); linted by `pnpm lint:fixtures`. | spec 001 | `tests/unit/no-*.test.ts`, `tests/unit/module-boundaries.test.ts` |
| `ts/` | Type-level fixtures, each of which **must fail** `tsconfig.fixtures.json`: `unchecked-index.ts` (strict flags, AC-2 / T-02), `format-time-in-zone-no-zone.ts` (the required IANA zone on `formatTimeInZone`/`formatDate`, spec 003 AC-17 / T-17). Excluded from `pnpm typecheck`. | spec 001, spec 003 (TASK-036) | `pnpm typecheck:fixtures`, `tests/unit/i18n-format.test.ts` |
| `seo/{sitemap,hreflang,schema}/` | The directories `pnpm seo:validate` reads. **Empty (`.gitkeep`) in spec 001**, so the validators print `no fixtures` and exit 0; spec 007 supplies the real set and the same job then gates it. | spec 001 (TASK-009) | `pnpm seo:validate` |
| `seo/_cases/` | Deliberately bad (and matching good) validator inputs: `bad-nonreciprocal.json`, `bad-price-mismatch.json`, `bad-forbidden-type.json`, `bad-sitemap-*.xml`, `good-*` (AC-22 / T-23). Kept **outside** the three directories above and copied into a temp directory by the tests, so a crashed test can never leave a broken fixture in the tree. Prettier-ignored (some are malformed on purpose). | spec 001 (TASK-009) | `tests/unit/seo-validate-*.test.ts` |
| `seo/lighthouse-urls.json` | The paths the `lighthouse` CI job measures, root-relative (`["/"]` in spec 001). Joined to the preview URL by `scripts/seo/lighthouse-urls.ts`; budgets live in `lighthouserc.json` (AC-23 / T-24). | spec 001 (TASK-009), 007 (real URL set) | `pnpm lighthouse`, `tests/unit/lighthouse-budgets.test.ts` |

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
