# Flowers Overseas

International flower relay for Europe. Planning repository: see `plan/00-summary.md` for the executive summary and `CLAUDE.md` for how work is done here (spec-driven, agent-enforced).

No application code exists yet. The first `/implement` happens against `specs/001-*` and a `TASK-` id.

## Layout
- `plan/` — the build plan (00–13)
- `specs/` — one spec per feature (template inside)
- `docs/adr/` — decision records · `docs/decisions-log.md`
- `docs/runbooks/` — operational procedures · `docs/compliance/` — RoPA, DPAs, sign-offs
- `docs/research/` — competitor and SERP research
- `.claude/` — agents, skills, hooks, settings for Claude Code
- `TASKS.md` — single source of truth for work

## Local setup (target: <15 minutes, to be completed by spec 001)
1. `pnpm install`
2. `cp .env.example .env.local` and fill from the Vercel env store (`vercel env pull`)
3. `pnpm db:migrate && pnpm db:seed`
4. `pnpm dev`

## Tests
Four layers, four commands. `tests/fixtures/README.md` says which fixtures live where.

| Command | Layer | Runs |
|---|---|---|
| `pnpm test` | unit (Vitest, `unit` project) | `tests/unit/**` in the node environment, with MSW active and `onUnhandledRequest: "error"` — a unit test that reaches the network fails (spec 001 AC-18) |
| `pnpm test:coverage` | unit | the same suite with `@vitest/coverage-v8`; thresholds come from `vitest.coverage.json` (empty in spec 001, raised per module by specs 005/007) |
| `pnpm test:integration` | integration (Vitest, `integration` project) | `tests/integration/**` against `DATABASE_URL` (a `postgres:16` service container in CI, the `.env.example` placeholder locally). Reported as **skipped** until spec 002 |
| `pnpm test:e2e` | e2e (Playwright: `e2e-desktop`, `e2e-mobile`) | `tests/e2e/**` |
| `pnpm test:visual` | visual (Playwright: `visual`, `pseudo-rtl`) | `tests/visual/**` against the committed baselines in `tests/visual/__screenshots__/`; regenerate with `pnpm test:visual --update-snapshots` |
| `pnpm test:a11y` | a11y (Playwright: `a11y`) | `tests/a11y/**` with `@axe-core/playwright`; zero serious/critical violations |

The Playwright suites need a running target, given by `PLAYWRIGHT_BASE_URL` (default
`http://localhost:3000`):

```
cp .env.example .env.local && pnpm build && pnpm start   # in one shell
pnpm exec playwright install chromium                    # once
pnpm test:e2e && pnpm test:a11y && pnpm test:visual      # in another
```

In CI the same three commands run against the pull request's Vercel preview URL, with
`x-vercel-protection-bypass` supplied from `VERCEL_AUTOMATION_BYPASS_SECRET`.

## Lint rules that encode the non-negotiables
The custom ESLint rules live in `eslint/fo/` — a local plugin, plain ESM JavaScript with JSDoc
types, imported directly by `eslint.config.mjs` (no build step, nothing published). Stylelint
(`stylelint.config.mjs`) is the CSS half of the same rules.

| Rule | What it stops | Spec |
|---|---|---|
| `fo/no-physical-css` | physical Tailwind utilities (`ml-4`, `md:-mr-2`, `text-left`, `rounded-l-`, `border-r-`, …) in `className`/`class` and in `cn`/`clsx`/`cva` arguments; the message names the logical replacement | 001 §7 · plan/03 §4 |
| Stylelint `property-disallowed-list` + `declaration-property-value-disallowed-list` | `margin-left/right`, `padding-left/right`, `left`, `right`, `border-left*`/`border-right*`, corner radii, `text-align: left\|right` in `*.css` | 001 §7 |
| `fo/no-literal-strings` | literal JSX text and literal `alt`/`title`/`placeholder`/`aria-label` values in `src/**` — copy comes from the message catalogue (spec 003) | 001 §7 · plan/03 §5 |

| Command | Purpose |
|---|---|
| `pnpm lint` | `lint:js` (ESLint) + `lint:css` (Stylelint on `src/**/*.css`) |
| `pnpm lint:fixtures` | runs both over `tests/fixtures/lint/`, which violates the rules on purpose; **exits 1 by design** and names every file and rule |
| `pnpm check:no-literal-disable` | fails if any file under `src/` disables `fo/no-literal-strings` (spec 001 AC-6) |

`tests/fixtures/lint/` is excluded from `pnpm lint`, Prettier and `tsc`; the rules are exercised
against it by `tests/unit/no-physical-css.test.ts`, `no-literal-strings.test.ts`,
`stylelint-physical-css.test.ts` and `lint-fixtures.test.ts`.

## SEO gates
Three fixture-driven validators guard the things a broken deploy would only reveal weeks later in
Search Console. Spec 001 ships the harness; spec 007 supplies the real fixtures and the live
crawl.

| Command | Reads | Fails when |
|---|---|---|
| `pnpm seo:validate` | all three directories below | any check below fails; prints `no fixtures` and exits 0 per empty directory |
| `node scripts/seo/validate-sitemap.ts [--dir …]` | `tests/fixtures/seo/sitemap/*.xml` (+ optional `noindex.json`) | the XML is not well-formed, a `<loc>` is not an absolute `https://` URL, or a `<loc>` is listed as `noindex` |
| `node scripts/seo/validate-hreflang.ts [--dir …]` | `tests/fixtures/seo/hreflang/*.json` | an alternate is not reciprocal, a cluster has no `x-default`, or an `hreflang` value is not BCP-47-ish |
| `node scripts/seo/validate-schema.ts [--dir …]` | `tests/fixtures/seo/schema/*.json` | the JSON-LD does not parse, a `@type` is outside the `plan/02` §9 allow-list (`LocalBusiness`, `FloristShop` and `JobPosting` are rejected by name), or `Offer.price`/`priceCurrency` differ from the fixture's `visiblePrice`/`visibleCurrency` |

Money is compared as strings normalised to two fraction digits — never parsed into a `number`
(`plan/12` §2, `fo/no-float-money`).

`pnpm lighthouse` runs Lighthouse CI with the `plan/01` §7 budgets from `lighthouserc.json`
(performance >= 0.95 mobile, LCP <= 2000 ms, CLS <= 0.05, script transfer <= 120 KB, image
transfer <= 200 KB) over the paths in `tests/fixtures/seo/lighthouse-urls.json`, resolved against
`LHCI_BASE_URL`, else `PLAYWRIGHT_BASE_URL`, else `http://localhost:3000`. In CI it runs on every
PR against the preview and is **informational until spec 004** (spec 001 §13 Q4): the job carries
`continue-on-error: true` while every assertion stays an `error`, so the job's own result is
honest.
