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

Phase 0 status: this is the repository and dev-OS bootstrap (`specs/001-repo-dev-os-bootstrap.md`).
`/` is a deliberately empty `noindex` shell; the product starts in spec 003 (i18n) and 004 (design
system). What already exists is the gate set: strict TypeScript, custom lint rules that encode the
non-negotiables, four test layers, SEO validators, CI and the task guard.

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
| `pnpm lighthouse` | Lighthouse CI with the `plan/01` §7 budgets from `lighthouserc.json` over `tests/fixtures/seo/lighthouse-urls.json` |
| `pnpm pr-policy` | the PR-title/branch-name/commit rules, runnable locally on a title string |
| `pnpm branch-protection` | verifies `main`'s protection and merge settings against AC-21; `--print-commands` prints what applies them |

`scripts/seo/validate-sitemap.ts` (well-formed XML, absolute `https://` `<loc>`, nothing that a
`noindex` fixture lists), `validate-hreflang.ts` (reciprocity, `x-default`, BCP-47-ish values) and
`validate-schema.ts` (JSON-LD parses, `@type` inside the `plan/02` §9 allow-list, `Offer.price`
equal to the fixture's `visiblePrice`) also run standalone with `--dir`. Money is compared as
strings normalised to two fraction digits, never parsed into a `number` (`fo/no-float-money`).

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

Two gates are informational for now, by decision rather than by neglect: `lighthouse` until spec
004 gives `/` something to paint (spec 001 §13 Q4), and `test-integration` until spec 002 gives it
a schema. Branch protection on `main` needs a GitHub Pro account and is pending a founder
decision — `docs/runbooks/branch-protection.md`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `corepack: command not found`, or Corepack refuses to run | Corepack is unbundled from Node 25+. `brew install pnpm` (the `packageManager` pin still applies), or `npm i -g corepack` |
| `ERR_PNPM_BAD_PM_VERSION` | a global pnpm older than the pin: `corepack use pnpm@12.3.4`, or upgrade the Homebrew pnpm |
| `pnpm build` fails with `invalid environment variables` and a key name | `.env.local` is missing or missing that key: `cp .env.example .env.local`. The error names the key and never the value, by design (AC-10) |
| Claude Code denies an `Edit`/`Write` under `src/` with `no task is active` | the PreToolUse guard: run `.claude/bin/task.sh set TASK-NNN` (the row must exist in `TASKS.md`) and clear it when the PR is open |
| `pnpm test` reports **5 skipped** | gitleaks is not installed — expected locally; `brew install gitleaks` to run them. The `audit` CI job always does |
| `pnpm test:integration` reports everything skipped | no schema until spec 002 (AC-16) |
| `pnpm lighthouse` fails with `NO_FCP` | `/` paints nothing yet, so Lighthouse aborts before any metric exists. Expected until spec 004; the CI job carries `continue-on-error: true` |
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
| Operational procedures, one per incident | `docs/runbooks/README.md` |
| Every decision and its history | `docs/adr/`, `docs/decisions-log.md` |
| RoPA, DPAs, VAT sign-off | `docs/compliance/` |
