# Flowers Overseas

## What this is

International flower **relay** for Europe (`flowersoverseas.com`). A buyer in one country orders
for a recipient in another; a vetted local florist makes and delivers; we own the brand, the
payment, the customer and the quality promise. We ship nothing — the product is trust plus
routing.

- The plan: `plan/00-summary.md` (executive summary) through `plan/13-open-questions.md`.
- The rules every contributor and agent follows: `CLAUDE.md`.
- The decisions and why: `docs/adr/`, indexed in `docs/decisions-log.md`.
- The system as wired today: `docs/architecture.md`.

Phase 0 status: the repository and dev-OS bootstrap (`specs/001-repo-dev-os-bootstrap.md`) plus
the i18n foundation (`specs/003-i18n-foundation.md`). Four locale URLs render — `/en`, `/en-gb`,
`/de`, `/pl` — behind a crawlable locale chooser at `/`, with typed message catalogues,
`Intl`-only formatters, address formats and a translation-review gate. Nothing is indexable yet
(`noindex` everywhere until spec 007) and `de`/`pl` are unreviewed English echoes by design, which
is exactly what `pnpm i18n:check` reports. Spec 002 (database) is approved but parked: there is no
Postgres, and nothing in spec 003 needs one (`pnpm check:no-db`). Design system and real copy are
spec 004. What exists besides the pages is the gate set: strict TypeScript, custom lint rules that
encode the non-negotiables, four test layers, SEO validators, CI and the task guard.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | the major in `.node-version` (24; `engines` accepts `>=24`) | `fnm use` / `nvm use`, or `brew install node@24` |
| pnpm | 12.3.4, pinned by `packageManager` | Corepack: `corepack enable` on Node 24; else `brew install pnpm` |
| git | any current | — |
| `gh` | any current | `brew install gh && gh auth login` — for PRs and `pnpm branch-protection` |
| `python3` | 3.9+ | preinstalled on macOS; the PreToolUse task guard parses its payload with it |
| gitleaks | 8.x, **optional locally** | `brew install gitleaks`; without it `pnpm test` skips the secret-scanning tests, and CI runs them anyway |

No database, Supabase project, Vercel account or real credential is needed: the `.env.example`
placeholders are valid on purpose, so a clean clone builds and runs offline apart from the package
registry.

## Local setup

Target: under 15 minutes on a machine that already has Node and git (spec 001 AC-30, `plan/12`
§9). The long form, with the expected output of every step, is
[`docs/runbooks/local-setup.md`](docs/runbooks/local-setup.md).

1. `git clone https://github.com/itsahmeds/flowers-overseas.git && cd flowers-overseas`
2. `corepack enable` — or `brew install pnpm` if Corepack is absent (see Troubleshooting)
3. `pnpm install --frozen-lockfile`
4. `cp .env.example .env.local`
5. `pnpm dev` — serves `http://localhost:3000`
6. `curl -s http://localhost:3000/api/health` — expect `{"status":"ok",…}` with `cache-control: no-store` and an `x-request-id`
   · `open http://localhost:3000/dev/components` — the design-system gallery (every token ramp and every component state). It exists because `.env.example` ships `ENABLE_DEV_UI=true`; unset it and the URL answers 404, and the env schema refuses it outright in production (spec 004 AC-28)
7. `pnpm lint && pnpm typecheck && pnpm test` — the local gate before any commit

Optional, and only when the Playwright layers are relevant:
`pnpm exec playwright install chromium`, then `pnpm build && pnpm start` in one shell and
`pnpm test:e2e` in another. There is deliberately no `webServer` in `playwright.config.ts` — the
target is a deployment, not a dev server — so **the server is yours to start by hand**: without a
production server on `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`) every e2e spec fails
on connection refused, and against `pnpm dev` several fail for real reasons (dev serves
unminified chunks, injects HMR scripts and skips the `headers()` cache rules the header specs
assert). Point `PLAYWRIGHT_BASE_URL` at a preview URL to run the same specs against one.

## Scripts

Every script in `package.json`, once.

**Run**

| Command | Does |
|---|---|
| `pnpm dev` | Next.js dev server on `:3000` |
| `pnpm build` | production build; fails if `lib/env.ts` cannot validate the environment |
| `pnpm start` | serves the production build |
| `pnpm prepare` | installs the husky hooks (runs automatically after `pnpm install`) |

**Quality gates**

| Command | Does |
|---|---|
| `pnpm lint` | `lint:js` + `lint:css` |
| `pnpm lint:js` | ESLint, including the custom `fo/*` rules in `eslint/fo/` |
| `pnpm lint:css` | Stylelint on `src/**/*.css` (the CSS half of the logical-properties ban) |
| `pnpm lint:fixtures` | runs both over `tests/fixtures/lint/`, which violates the rules on purpose: **exit 1 with a list of files and rules is the pass condition** |
| `pnpm typecheck` | `tsc --noEmit` on the app (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `pnpm typecheck:fixtures` | the same over `tests/fixtures/ts/`, which must fail to typecheck |
| `pnpm format` | Prettier, write |
| `pnpm format:check` | Prettier, check only (the CI form) |
| `pnpm check-layout` | the `plan/01` §5 tree and the twelve module barrels exist and nothing extra does |
| `pnpm check:no-literal-disable` | no file under `src/` disables `fo/no-literal-strings` |
| `pnpm check:no-db` | no file in the scanned set (`src/config/`, `src/modules/i18n/`, `src/modules/catalog/`, `seed/schema/`, `seed/project.ts`, `seed/media-variants.ts`, `seed/copy*.ts`, `seed/check*.ts`, `seed/budgets.ts`) imports a database client, an ORM or a Postgres driver, or reads `DATABASE_URL` |
| `pnpm seed:project` | regenerates the projected half of `seed/data/**` — `taxonomy.json`, `categories.json`, `occasions.json`, `products.json`, `product-tiers.json`, `addons.json` — from the authored catalogue dataset in `src/config/catalogue/` (ADR-0017). Offline, byte-deterministic and Prettier-formatted with the repository configuration, so the committed files are exactly what a fresh projection and the Prettier gate produce. `--check` prints the stale files and exits non-zero without writing. **Never hand-edit a projected file**: edit `src/config/catalogue/*.data.ts` and re-run this |
| `pnpm seed:check` | the seed-dataset gate (spec 006 AC-10, AC-30): the nine rule families of spec 006 §2.3 over `seed/data/**` — every file parsing under its own schema with its `version`/`source`/`origin` header and no projected file hand-edited; the counts and the 40/14/8/10/12 product split; referential integrity (facet values, category and occasion edges, a price row per seeded destination, a media asset's product and its prompt hash); slugs (ASCII, lowercase, hyphenated, no trailing slash, the ASCII fold of the name, unique per locale **across** products, categories and occasions); prices, through the same band, ending, tier-step and single-open-ended-row checks the catalogue gate above uses, run over the rows in the files; copy (60–90 words, the closing local-florist sentence, banned superlatives, no duplicate description, no delivery-timing claim); media (one primary per product, no `delivery` asset, and — once a variants manifest or `alt/` exists — variants present with matching bytes and alt text per launch locale); **no PII and no third-party mark** anywhere, reported with the file and the JSON path; and the committed-imagery byte budgets. One line per problem naming the file, the entity key and the rule. `--report` prints the standing catalogue-health report of spec 006 §11 (product counts, the per-(country, category) and per-(country, occasion) six-product coverage table, price extremes, the word-count distribution, copy review shares per locale, committed image bytes, per-slot maxima, products still on a placeholder, `seoTitle` near-duplicate pairs) and appends it to the GitHub step summary |
| `pnpm media:variants` | the deterministic imagery ladder (spec 006 §2.4, AC-12/13/14): for every asset in `seed/data/media.json` whose original is present under the git-ignored `.local/imagery/originals/`, it strips EXIF and GPS (keeping the ICC profile, and XMP when it carries a C2PA claim), crops to the slot's declared aspect ratio, encodes AVIF (q50/effort 4) + WebP (q72) at 384/640/828/1080/1200/1600/1920 plus one 1200 px JPEG for OG and email, writes `public/media/{assetId}/{width}.{fmt}` and rewrites `seed/data/media-variants.json`. The pinned `sharp`/libvips versions and every encoder option are recorded in that file's header, and the encoder is held to one thread because libaom's AVIF output depends on its thread count — so two runs are byte-identical and changing one option is a whole-manifest re-derivation. A missing original is reported, never fatal. `--only <assetId>` derives one asset; **`--check` is the CI mode** and reads only committed bytes: every manifest entry has a file, every file has an entry, every checksum matches. Generation never runs in CI |
| `pnpm cookies:check` | the cookie register (`src/config/cookies.ts`) against the generated table in `docs/compliance/cookie-register.md`; `--write` rewrites the block. The machine register is the source of truth and the prose file derives from it, so a lifetime cannot be disclosed as one number and set as another (spec 004 AC-22) |
| `pnpm env:check` | `.env.example` keys and the zod schema in `src/lib/env.schema.ts` are the same set |
| `pnpm db:check` | migration/rollback pairing — a stub until spec 002 |
| `pnpm i18n:check` | the catalogue gate (spec 003 AC-13, AC-22): keys missing after fallback resolution, unused `en` keys (`retained: true` in `messages/en.meta.json` is the only escape), ICU syntax errors, argument-set mismatches between a key and its translations, redundant `en-gb` overrides, missing or orphan review records, stale `sourceHash` values, and the `pathSegments` shape plus per-locale uniqueness. `--summary` prints the per-locale table (keys, missing, unreviewed count and share, stale, indexable) and appends it to the GitHub step summary; `--messages-dir`, `--src` and `--registry` point the checks at a fixture tree |
| `pnpm catalogue:check` | the catalogue and price gate (spec 005 AC-5): every product has a tier and exactly one default tier, every tier of every product has exactly one active `country_price` row in every `live`/`demo` destination, no second open-ended row for one (product, country, tier, surcharge) and no overlapping closed windows, **every** tier inside its `plan/10` §2.3 band with the tiers increasing (spec 005 §14 A1: the bands hold exactly, the "~+30% / +60%" steps are approximate), each destination's Sunday and peak-day surcharge at `plan/10` §2.3's +€4 / +€6 equivalent, every amount an integer minor unit on the currency's psychological ending, every add-on priced per destination and carrying the destination's *standard* VAT rate rather than its flower rate, every facet value in the `plan/10` §1.1 taxonomy, every `labelKey` present and spellable in `messages/en.json`, the euro-base FX snapshot dated and integer, and every projection's key set equal to spec 002 §5.1's columns. `--summary` appends the per-destination coverage table to the GitHub step summary |
| `pnpm i18n:draft` | invoked as `pnpm i18n:draft --locale <code>`: fills `messages/<code>.json` and `messages/<code>.meta.json` from `messages/en.json` with the deterministic, offline echo provider (spec 003 §13 Q7): every written key gets `source: "machine"`, `reviewed: false` and a `sourceHash`, human and reviewed copy is kept and reported stale instead, and a re-run writes nothing. `--dry-run` reports without writing. For `de` and `pl` the same run also drafts the **catalogue copy** in `seed/data/copy/<code>/` from `seed/data/copy/en/` with the same review triple (spec 006 §7); `pnpm i18n:draft --sync-copy` re-flows the closing local-florist sentence of every description in every locale from `catalog.floristSentence`, so rewording it is one edit |
| `pnpm i18n:pseudo` | regenerates the two git-ignored pseudo-locale catalogues, `messages/en-XA.json` (accented, expanded ≥ 40 %, bracketed) and `messages/ar-XB.json` (right-to-left mirror), deterministically from `messages/en.json` (spec 003 §2, AC-29). The routes derive the same values in memory, so the files are for reading diffs and for the catalogue gate's determinism clause (check 9); `--check` exits non-zero when they are stale or missing. The `/en-XA` and `/ar-XB` URLs exist only where `ENABLE_PSEUDO_LOCALES=true` (locally and on previews; the env schema refuses it in production) |
| `pnpm fonts:build` | regenerates the committed WOFF2 subsets under `src/modules/ui/fonts/` from the upstream variable TTFs and rewrites `subset.json` with the byte table (spec 004 AC-4). **Needs the network and is run by hand, never by the build** — the output is committed, so a clean clone and every CI job stay offline. Re-run it only to change the character repertoire, an axis pin or an upstream version, and commit the diff; the unit suite fails if the recorded bytes and the files disagree or the ≤45 KB per-page budget is broken |
| `pnpm audit` | `pnpm audit --prod --audit-level=high` plus `audit:secrets` (invoke it as `pnpm run audit`: pnpm's built-in `audit` shadows the script name) |
| `pnpm audit:secrets` | gitleaks over the working tree and history; skips with a notice when gitleaks is absent |

**Tests** — four layers, and `tests/fixtures/README.md` says which fixtures live where.

| Command | Layer |
|---|---|
| `pnpm test` | unit (Vitest `unit` project) over `tests/unit/**`, MSW active with `onUnhandledRequest: "error"` — a unit test that reaches the network fails |
| `pnpm test:coverage` | the unit suite with V8 coverage; thresholds from `vitest.coverage.json` (empty in 001, raised per module by 005/007) |
| `pnpm test:integration` | integration against `DATABASE_URL`; reported as **skipped** until spec 002 |
| `pnpm test:contract` | adapter-versus-recorded-fixture tests; no tests yet (`--passWithNoTests`) |
| `pnpm test:e2e` | Playwright `e2e-desktop` + `e2e-mobile` against `PLAYWRIGHT_BASE_URL` |
| `pnpm test:visual` | Playwright `visual` + `pseudo-rtl` against the baselines in `tests/visual/__screenshots__/<project>/<platform>/` (`--update-snapshots` to regenerate). Baselines are **per platform** since spec 003 gave `/` real text: your macOS run compares against `darwin/`, CI against `linux/`. Regenerate the `linux/` baseline from the `visual` job — it uploads the screenshots it wrote when it fails — and commit both. |
| `pnpm test:a11y` | Playwright `a11y` with `@axe-core/playwright`: zero serious/critical violations. Includes `/dev/components`, so the target needs `ENABLE_DEV_UI=true` |
| `pnpm dev-os:check` | the shell checks in `tests/dev-os/` against the real hooks and `.claude/bin/task.sh`, in throwaway project roots |

**SEO and repository policy**

| Command | Does |
|---|---|
| `pnpm seo:validate` | the three validators below over `tests/fixtures/seo/`; `no fixtures` and exit 0 per empty directory |
| `pnpm lighthouse` | Lighthouse CI with the `plan/01` §7 budgets from `lighthouserc.json` over `tests/fixtures/seo/lighthouse-urls.json` (`/`, `/en`, `/de`) |
| `pnpm budget:client-js` | reads the prerendered documents of the last production build and prints, per URL, the Brotli (and gzipped) size of the scripts a browser actually fetches, chunk by chunk, plus the serialised client message payload per locale, plus whether any route ships `zod` or `@sentry/`. Budgets: **128 KB Brotli** of JS (`plan/01` §7 as restated by spec 004 §13 Q13 and corrected by §14 A1 — transfer size, which is what Vercel serves and Lighthouse measures; `lighthouserc.json` takes the same number when TASK-056 flips that job to blocking) and 4 KB gz of messages (spec 003 §6, AC-27). Exits non-zero on a breach; build first. `<script noModule>` (Next's legacy polyfill bundle) is listed but not counted — no module-supporting browser fetches it |
| `pnpm pr-policy` | the PR-title/branch-name/commit rules, runnable locally on a title string |
| `pnpm branch-protection` | verifies `main`'s protection and merge settings against AC-21; `--print-commands` prints what applies them |

`scripts/seo/validate-sitemap.ts` (well-formed XML, absolute `https://` `<loc>`, nothing that a
`noindex` fixture lists), `validate-hreflang.ts` (reciprocity, `x-default`, BCP-47-ish values) and
`validate-schema.ts` (JSON-LD parses, `@type` inside the `plan/02` §9 allow-list, `Offer.price`
equal to the fixture's `visiblePrice`) also run standalone with `--dir`. Money is compared as
strings normalised to two fraction digits, never parsed into a `number` (`fo/no-float-money`).

## Locale and URLs

One domain, locale in the path, and no request header ever decides what a URL returns
(ADR-0001, ADR-0006, `plan/02` §3, `plan/03`).

| Rule | In practice |
|---|---|
| **The locale is in the URL, always.** | `/{locale}/…` for every page: `/en`, `/en-gb`, `/de`, `/pl`. `en-gb` is a separate locale, not a variant — GBP and UK consumer law make it a genuinely different page. `src/config/locales.ts` is the registry; adding a locale is a data change (spec 003 AC-31). |
| **`/` never redirects.** | It is a server-rendered, zero-JS, `noindex,follow` list of locale links — the crawl entry point that puts every locale root at depth 1. No IP redirect, no `Accept-Language` redirect, no language guess, ever. |
| **No response varies by header.** | The locale comes from the path segment and from nothing else, so `/en` is byte-identical for every client and no response carries `Vary` or `Set-Cookie`. `pnpm lint` fails on a geo redirect (`fo/no-geo-redirect`) and on importing `next-intl/middleware`. |
| **The visitor's language is a suggestion, never an action.** | A client island reads `navigator.languages` after hydration and offers a switch; the visitor's click is what writes `fo_locale` (365 days, `SameSite=Lax`, one of four values). `docs/compliance/cookie-register.md` is the register. |
| **Every URL segment is authored, per locale.** | Never a translated slug at request time: `localePath()` builds every URL from the `pathSegments` in the registry (`/de/blumen-versenden-nach/…`, `/pl/kwiaty-do/…`), and `pnpm i18n:check` fails an uppercase, non-ASCII, trailing-slash or duplicated segment. |
| **Unknown locales 404.** | `/fr`, `/xx`, `/EN`, `/nope` return 404 with an x-default document — never a 3xx and never a fabricated locale page. |
| **A locale is indexable only when it is reviewed.** | `isLocaleIndexable()` reads the review manifests: above 5% unreviewed the locale is kept out of `hreflang` and tagged `beta`. `de` and `pl` are 0% reviewed today, so they are honestly excluded. Nothing is indexable at all until spec 007. |
| **Currency is not in the URL.** | It rides in a cookie and never forks a URL (`plan/02` §4); destination country does appear in shop URLs, because the page is genuinely different per corridor. |

Copy never appears as a literal in a component (`fo/no-literal-strings`); it comes from
`messages/*.json` through the typed catalogue, and numbers, money, dates and lists are formatted
only by `src/modules/i18n/format.ts` (`fo/no-adhoc-intl`). `docs/runbooks/i18n-translations.md`
is the day-to-day procedure.

## How work happens here

Spec-driven and agent-enforced; the long version is `CLAUDE.md`, which every session reads first.

1. `/spec <feature>` → `specs/NNN-<slug>.md`, approved before any code exists.
2. `/plan-tasks <spec>` → `TASK-NNN` rows in `TASKS.md`, the single source of truth for work.
3. `/implement <TASK-ID>` → one task, one branch `task/TASK-NNN-<slug>`, one PR titled
   `type(scope): summary (TASK-NNN)`.
4. `/review <PR>` → a recorded PASS is the merge gate; only then does the row become `done`.

Two hooks make that mechanical rather than remembered: a PreToolUse guard denies edits under
`src/ app/ supabase/ emails/ seed/ tests/` unless `.claude/state/active-task` names a task
(`.claude/bin/task.sh set TASK-NNN`), and a Stop hook reminds you when application code changed
but `TASKS.md` did not. Decisions become `docs/adr/ADR-NNNN-*.md`, immutable and superseded rather
than edited.

## Quality gates

`ci.yml` runs on every pull request and every push to `main`, in `plan/12` §5 order: `lint` (with
`env:check` as a step) → `typecheck` → `test-unit` → `test-integration` (Postgres service
container) → `test-contract` → `build` → `db-check` → wait for the Vercel preview → `e2e` +
`visual` + `a11y` against it → `lighthouse` → `seo-validate` + `dev-os-check` (both on
`typecheck`, since neither needs a deployment) → `audit`. `pr-policy.yml` checks the PR title,
the branch name and every commit message with commitlint. Each job writes a step summary.

Everything CI runs is runnable locally with the commands above, and the non-negotiables of
`CLAUDE.md` are lint errors rather than review comments: `fo/no-physical-css` (no `ml-`/`left-`;
logical properties only), `fo/no-literal-strings` (copy comes from the message catalogue),
`fo/no-direct-order-status-write` (status changes only through `orderService.transition`,
ADR-0009), `fo/no-geo-redirect` (no IP redirect, ever — ADR-0006), `fo/no-adhoc-intl` (no second
way to render a price, a date or a list: `Intl.*` formatters, `toLocale*`, `toFixed` and
hand-built `${x} zł` / `${x}%` strings live only in `src/modules/i18n/format.ts` and
`collate.ts`), `fo/no-float-money` and
`import/no-restricted-paths` (`app/` imports `modules/`, never the reverse; modules meet only at
their public `index.ts`).

Three gates are informational for now, by decision rather than by neglect.

- `test-integration`, until spec 002 gives it a schema.
- `lighthouse`, and the `build` job's `budget:client-js` step with it, until TASK-056 flips them.
  Spec 003 §14 A12 asked three questions and spec 004 §13 Q13 answered two of them on 2026-09-08:
  the budget is restated as **≤ 128 KB Brotli transfer** (131 072 B, spec 004 §14 A1's
  correction of §13 Q13's 120 KB — transfer size is what Lighthouse reads and Brotli is what
  Vercel serves), and zod was taken off the client. It reached
  the browser through the one import chain a Client Component cannot avoid — Next's root error
  boundary, `src/app/global-error.tsx`, whose chunk Next attaches to every document — and
  TASK-046 broke that chain — twice, because the first attempt only moved zod behind a lazy
  chunk that every locale document still fetched (`/review 26`): the `global-error` document
  reads a zod-free locale-data module, and the suggestion-banner island's decision path
  (`src/modules/i18n/hints.ts`) reaches no schema either.

  Measured with a browser against `pnpm build && pnpm start`, summing Brotli (quality 11) over
  every `.js` the page requests, lazily fetched chunks included:

  | URL | before (spec 003 tree) | after |
  |---|---|---|
  | `/` | 226 575 B gz / 190 706 B br (186.2 KB) | 136 067 B gz / **116 393 B br (113.7 KB)** — within, 6 487 B spare |
  | `/en`, `/de` | 240 633 B gz / 203 197 B br (198.4 KB) | 150 992 B gz / **129 638 B br (126.6 KB)** — 6 758 B (5.5%) over |

  What is left is the framework: `/` fetches nothing but the runtime and already measures
  113.7 KB Brotli (react-dom 61.1, the App Router runtime 38.8, ~13.5 KB of bootstrap and
  route shells), leaving 6.3 KB of the budget, while a locale document adds
  `NextIntlClientProvider` + `@formatjs` at 10 705 B and the banner island's own chunk at
  2 173 B. Whether the budget moves again or the provider does is **spec 004 §13 Q13 option
  (b)** and a founder decision; TASK-046 escalated it rather than loosening the number.
  Everything else Lighthouse asserts already passes: performance 0.96–0.99, accessibility 1.00,
  CLS 0. The one other red assertion, LCP 2.0–2.5 s against 2.0 s, is the same finding — script
  transfer is what delays the paint on a text-only page. Lighthouse's own script number reads
  higher than the table above because a protected preview also runs the platform's `vercel.live`
  script (25 376 B on `/`, ~48 KB on a locale document), which is not in our build output;
  `lighthouserc.json`'s note reconciles the two and TASK-056 owns where the blocking measurement
  is taken. (The SEO category is collected but deliberately not asserted, because the site
  is `noindex` until spec 007; nobody may make a number green by indexing early.) Both gates
  measure and publish the numbers on every PR meanwhile; neither blocks.
- Branch protection on `main` needs a GitHub Pro account and is pending a founder decision —
  `docs/runbooks/branch-protection.md`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `corepack: command not found`, or Corepack refuses to run | Corepack is unbundled from Node 25+. `brew install pnpm` (the `packageManager` pin still applies), or `npm i -g corepack` |
| `ERR_PNPM_BAD_PM_VERSION` | a global pnpm older than the pin: `corepack use pnpm@12.3.4`, or upgrade the Homebrew pnpm |
| `pnpm build` fails with `invalid environment variables` and a key name | `.env.local` is missing or missing that key: `cp .env.example .env.local`. The error names the key and never the value, by design (AC-10) |
| Claude Code denies an `Edit`/`Write` under `src/` with `no task is active` | the PreToolUse guard: run `.claude/bin/task.sh set TASK-NNN` (the row must exist in `TASKS.md`) and clear it when the PR is open |
| `pnpm test` reports **5 skipped** | gitleaks is not installed — expected locally; `brew install gitleaks` to run them. The `audit` CI job always does |
| `pnpm test:integration` reports everything skipped | no schema until spec 002 (AC-16) |
| `pnpm lighthouse` fails on `resource-summary:script:size` | expected and not yours to fix. Our own chunks measure 116 393 B Brotli on `/` (within) and 129 638 B on `/en` (6 758 B over, framework runtime plus `NextIntlClientProvider`; see Quality gates), but Lighthouse also counts the `vercel.live` script a protected preview injects — 25 376 B on `/` and ~48 KB on a locale document — so its number is tens of KB higher on a preview and lower on production, where that script is absent. `pnpm budget:client-js` is the attributable measurement. The CI job carries `continue-on-error: true` until TASK-056 |
| `pnpm lighthouse` fails with `NO_FCP` | Lighthouse aborted before any metric existed because the page painted nothing. Expected in spec 001, **not** expected now that every measured URL renders text: the preview did not serve the document, so check the deployment and the bypass header |
| `pnpm budget:client-js` says `no prerendered document for /en` | it reads `.next/`, so run `pnpm build` first; `pnpm dev` writes no prerendered HTML |
| `pnpm lint:fixtures` "fails" | it is meant to: `tests/fixtures/lint/` violates the custom rules on purpose |
| `pnpm branch-protection` exits 1 with `UNAVAILABLE ON THIS PLAN` | a private repository on GitHub Free (403): `docs/runbooks/branch-protection.md` §0 |
| Playwright `Executable doesn't exist` | `pnpm exec playwright install chromium` |

## Where to look next

| Question | Where |
|---|---|
| What is being built, and why | `plan/00-summary.md` → `plan/13-open-questions.md` |
| How work is done, and what is forbidden | `CLAUDE.md` |
| What is in flight, blocked or next | `TASKS.md` (tasks, phase progress, open decisions) |
| The system, the module map and what spec 001 deferred | `docs/architecture.md` |
| Setting up a clean machine, step by step | `docs/runbooks/local-setup.md` |
| Adding a message key, drafting a locale, handing it to a reviewer | `docs/runbooks/i18n-translations.md` |
| Brand terms, tone, taboo words, per-locale register | `content/i18n/glossary.en.md` and the per-locale stubs beside it |
| Which cookie the site sets, and on whose action | `docs/compliance/cookie-register.md` |
| Operational procedures, one per incident | `docs/runbooks/README.md` |
| Every decision and its history | `docs/adr/`, `docs/decisions-log.md` |
| RoPA, DPAs, VAT sign-off | `docs/compliance/` (`ropa.md`, `cookie-register.md`, `vat-rates.md`) |
