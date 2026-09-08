# `tests/fixtures/lint/`

Fixtures for the custom `fo/*` ESLint rules and the Stylelint disallow lists (spec 001 §2, §5).

These files intentionally violate the rules, so they are **excluded from the main lint run**
(`globalIgnores` in `eslint.config.mjs`; Stylelint only ever sees `src/**/*.css` in `lint:css`) and
from Prettier and `tsc` (`.prettierignore`, `tsconfig.json` excludes) so they stay byte-exact.

Two ways to run the rules against them:

| Command | What it does |
|---|---|
| `pnpm lint:fixtures` | runs ESLint + Stylelint on this directory with `--no-ignore`; **exits non-zero** by design (the executable form of AC-4, AC-5, AC-7, AC-8, AC-9) |
| `pnpm test` | `tests/unit/no-physical-css.test.ts`, `no-literal-strings.test.ts`, `stylelint-physical-css.test.ts`, `no-direct-order-status-write.test.ts`, `no-geo-redirect.test.ts`, `no-float-money.test.ts`, `no-adhoc-intl.test.ts`, `module-boundaries.test.ts`, `lint-fixtures.test.ts` (RuleTester / Stylelint API / ESLint Node API over the real config) |

The TASK-003 `*.tsx` fixtures are free of TypeScript-only syntax, because their RuleTester runs
parse them with espree (`ecmaFeatures.jsx`). The TASK-004 `*.ts` fixtures do use annotations —
`fo/no-float-money` exists to flag `: number` on a money name — so their tests parse with the
TypeScript parser taken from `eslint-config-next/typescript` (`tests/unit/support/ts-parser.ts`),
as do the TASK-037 `adhoc-intl-*.ts` fixtures.

`fo/no-adhoc-intl` is switched on for the `adhoc-intl-*.ts` fixtures and the two mirrored
formatter files only, not for the whole directory: `float-money-valid.ts` is a TASK-004 fixture
whose point is that money went through `new Intl.NumberFormat`, and it stays clean.

`src/` inside this directory is a **mirror of the repository layout**, not a second application.
It exists for two reasons:

- path-dependent rules: `fo/no-direct-order-status-write`, `fo/no-geo-redirect` and
  `fo/no-adhoc-intl` allow what they ban when the file is `src/modules/orders/service/**`,
  `src/modules/i18n/hints.ts` or `src/modules/i18n/format.ts` / `collate.ts` (matched by path
  suffix, which is why the mirror works), so the "passes inside" halves of spec 001 AC-7 / AC-8
  and spec 003 AC-21 need fixtures at those paths;
- `import/no-restricted-paths` **resolves every specifier and skips the ones it cannot resolve**,
  so an offending `@/modules/catalog/internal/pricing` import has to point at a real file. The
  mirror provides one, `tsconfig.lint-fixtures.json` maps `@/*` onto the mirror for the resolver,
  and `eslint.config.mjs` generates the zones for the mirror with the same
  `moduleBoundaryZones()` function it uses for the real `src/` tree.

`stubs.ts` holds the Drizzle/Next stand-ins so the fixtures need no dependencies.

| File | Expected |
|---|---|
| `physical-css.tsx` | `fo/no-physical-css` (`ml-4`, `text-left`) |
| `physical-css-variant.tsx` | `fo/no-physical-css` (`md:-mr-2`) |
| `physical-css-helper.tsx` | `fo/no-physical-css` inside a `cn()` call |
| `logical-css.tsx`, `logical-css-variant.tsx`, `logical-css-helper.tsx` | clean |
| `physical.css` | `property-disallowed-list` / `declaration-property-value-disallowed-list` |
| `logical.css` | clean |
| `literal-string.tsx` | `fo/no-literal-strings` (JSX text) |
| `literal-aria.tsx` | `fo/no-literal-strings` (`aria-label`) |
| `literal-alt.tsx` | `fo/no-literal-strings` (`alt`) |
| `literal-strings-valid.tsx` | clean (`className`, `href`, `data-testid`, punctuation-only text) |
| `order-status-drizzle.ts` | `fo/no-direct-order-status-write` (`db.update(orders).set({ status })`) |
| `order-status-sql.ts` | `fo/no-direct-order-status-write` (`` sql`UPDATE orders SET status …` ``) |
| `order-status-valid.ts` | clean (non-status column, status read) |
| `src/modules/orders/service/transition.ts` | clean — the state machine owns the column (ADR-0009) |
| `geo-redirect-header.ts` | `fo/no-geo-redirect` (`headers.get("x-vercel-ip-country")`) |
| `geo-redirect-geo.ts` | `fo/no-geo-redirect` (`request.geo?.country`) |
| `geo-redirect-middleware.ts` | `fo/no-geo-redirect` (`NextResponse.redirect` in a `middleware.ts`-named file) |
| `geo-redirect-proxy.ts` | `fo/no-geo-redirect` (the same redirect in a `proxy.ts`-named file, spec 003 AC-11) |
| `geo-redirect-nextintl-middleware.ts` | `fo/no-geo-redirect` ×2 (`next-intl/middleware` import and `createMiddleware(`, spec 003 AC-10) |
| `geo-redirect-valid.ts` | clean (`accept-language`, redirect outside proxy/middleware/i18n) |
| `geo-redirect-valid-proxy.ts` | clean (a `proxy.ts`-named file that only reads and sets its own headers) |
| `src/modules/i18n/hints.ts` | clean — the one file allowed to read a location hint (ADR-0006) |
| `src/modules/orders/cross-module-import.ts` | `import/no-restricted-paths` (deep import into `catalog`) |
| `src/modules/orders/module-imports-app.ts` | `import/no-restricted-paths` (`modules/` → `app/`) |
| `src/modules/orders/module-imports-valid.ts` | clean (import through the `catalog` barrel) |
| `adhoc-intl-numberformat.ts` | `fo/no-adhoc-intl` (`new Intl.NumberFormat` outside the formatter module, spec 003 AC-21) |
| `adhoc-intl-tolocalestring.ts` | `fo/no-adhoc-intl` (`(1234.5).toLocaleString("de")`) |
| `adhoc-intl-tolocaledatestring.ts` | `fo/no-adhoc-intl` (`date.toLocaleDateString()`) |
| `adhoc-intl-tofixed.ts` | `fo/no-adhoc-intl` (`ratio.toFixed(2)`) |
| `adhoc-intl-template-currency.ts` | `fo/no-adhoc-intl` (`` `${amount} zł` ``) |
| `src/modules/i18n/format.ts` | clean — the same five constructs in the one file allowed to build them (AC-21 second half) |
| `src/modules/i18n/collate.ts` | clean — the second allowed file (`Intl.Collator`) |
| `float-money.ts` | `fo/no-float-money` — **unit tests only**; the rule is not enabled in `eslint.config.mjs` until spec 005 (spec 001 §2), so `pnpm lint:fixtures` does not report this file |
| `float-money-valid.ts` | clean (integer minor units, `Intl.NumberFormat`) |
| `stubs.ts`, `src/app/page.ts`, `src/modules/*/index.ts`, `src/modules/catalog/internal/pricing.ts` | clean — stand-ins and mirror targets |
