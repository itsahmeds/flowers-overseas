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
7. `pnpm lint && pnpm typecheck && pnpm test` — the local gate before any commit

Optional, and only when the Playwright layers are relevant:
`pnpm exec playwright install chromium`, then `pnpm build && pnpm start` in one shell and
`pnpm test:e2e` in another (`PLAYWRIGHT_BASE_URL` defaults to `http://localhost:3000`).

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
| `pnpm check-layout` | the `plan/01` §5 tree and the eleven module barrels exist and nothing extra does |
| `pnpm check:no-literal-disable` | no file under `src/` disables `fo/no-literal-strings` |
| `pnpm check:no-db` | no file in the spec 003 file set (`src/config/`, `src/modules/i18n/`) imports a database client, an ORM or a Postgres driver, or reads `DATABASE_URL` |
| `pnpm env:check` | `.env.example` keys and the zod schema in `src/lib/env.schema.ts` are the same set |
| `pnpm db:check` | migration/rollback pairing — a stub until spec 002 |
| `pnpm i18n:check` | the catalogue gate (spec 003 AC-13, AC-22): keys missing after fallback resolution, unused `en` keys (`retained: true` in `messages/en.meta.json` is the only escape), ICU syntax errors, argument-set mismatches between a key and its translations, redundant `en-gb` overrides, missing or orphan review records, stale `sourceHash` values, and the `pathSegments` shape plus per-locale uniqueness. `--summary` prints the per-locale table (keys, missing, unreviewed count and share, stale, indexable) and appends it to the GitHub step summary; `--messages-dir`, `--src` and `--registry` point the checks at a fixture tree |
| `pnpm i18n:draft` | invoked as `pnpm i18n:draft --locale <code>`: fills `messages/<code>.json` and `messages/<code>.meta.json` from `messages/en.json` with the deterministic, offline echo provider (spec 003 §13 Q7): every written key gets `source: "machine"`, `reviewed: false` and a `sourceHash`, human and reviewed copy is kept and reported stale instead, and a re-run writes nothing. `--dry-run` reports without writing |
| `pnpm i18n:pseudo` | regenerates the two git-ignored pseudo-locale catalogues, `messages/en-XA.json` (accented, expanded ≥ 40 %, bracketed) and `messages/ar-XB.json` (right-to-left mirror), deterministically from `messages/en.json` (spec 003 §2, AC-29). The routes derive the same values in memory, so the files are for reading diffs and for the catalogue gate's determinism clause (check 9); `--check` exits non-zero when they are stale or missing. The `/en-XA` and `/ar-XB` URLs exist only where `ENABLE_PSEUDO_LOCALES=true` (locally and on previews; the env schema refuses it in production) |
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
| `pnpm test:a11y` | Playwright `a11y` with `@axe-core/playwright`: zero serious/critical violations |
| `pnpm dev-os:check` | the shell checks in `tests/dev-os/` against the real hooks and `.claude/bin/task.sh`, in throwaway project roots |

**SEO and repository policy**

| Command | Does |
|---|---|
| `pnpm seo:validate` | the three validators below over `tests/fixtures/seo/`; `no fixtures` and exit 0 per empty directory |
| `pnpm lighthouse` | Lighthouse CI with the `plan/01` §7 budgets from `lighthouserc.json` over `tests/fixtures/seo/lighthouse-urls.json` (`/`, `/en`, `/de`) |
| `pnpm budget:client-js` | reads the prerendered documents of the last production build and prints, per URL, the gzipped (and Brotli) size of the scripts a browser actually fetches, chunk by chunk, plus the serialised client message payload per locale. Budgets: 120 KB gz of JS (`plan/01` §7) and 4 KB gz of messages (spec 003 §6, AC-27). Exits non-zero on a breach; build first. `<script noModule>` (Next's legacy polyfill bundle) is listed but not counted — no module-supporting browser fetches it |
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
- `lighthouse`, and the `build` job's `budget:client-js` step with it, until the founder rules on
  the client-JS budget. The reason is measured, not scheduled: **Next 16.3.4's own client runtime
  is 130.1 KB gzipped** — react-dom 71.4 KB, the App Router runtime 46.0 KB, ~12.7 KB of
  bootstrap — against `plan/01` §7's 120 KB budget, on a document that ships no application
  JavaScript at all. Spec 003 removed the browser Sentry SDK from public routes for this reason
  and took `/` from 297 KB to 221 KB gz and `/en` from 309 KB to 233 KB. What is left above the
  framework floor is zod (85 KB gz), which reaches the browser through the one import chain a
  Client Component cannot avoid — Next's root error boundary, `src/app/global-error.tsx`, which
  needs the message catalogue to render a localised 500 page. Breaking that chain would take `/`
  to 132 KB gz / 113 KB br and needs a decision spec 003 did not take. The whole thing — move the
  budget, measure Brotli transfer size instead (which is what Lighthouse reads), or break the zod
  chain — is recorded as **spec 003 §14 A12** and owned by spec 004 task 2. Everything else
  Lighthouse asserts already passes on the shipped tree: performance 0.96–0.99, accessibility
  1.00, CLS 0. The one other red assertion, LCP 2.0–2.5 s against 2.0 s, is the same finding —
  script transfer is what delays the paint on a text-only page. (The SEO category scores 0.63
  because the site is deliberately `noindex` until spec 007; nobody may "fix" that by indexing
  early.) Both gates measure and publish the numbers on every PR meanwhile; neither blocks.
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
| `pnpm lighthouse` fails on `resource-summary:script:size` | expected, and not yours to fix: the framework runtime alone is over the 120 KB budget (see Quality gates). The CI job carries `continue-on-error: true` until the founder rules (spec 003 §14 A12) |
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
| RoPA, DPAs, VAT sign-off | `docs/compliance/` |
