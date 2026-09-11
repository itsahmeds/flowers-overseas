# Runbook — local setup, clean clone to running app

Owner: founder / any contributor. Spec: `specs/001-repo-dev-os-bootstrap.md` §2 "Documentation and
ledger", AC-30 / T-31 (`plan/12` §9: under 15 minutes). The short version lives in `README.md`
"Local setup"; this runbook is the long one, with the output each step should print and what to do
when it prints something else.

Target: **under 15 minutes** on a machine that already has git and a Node version manager, most of
it `pnpm install`. Nothing here needs a database, a Supabase project, a Vercel account or any real
credential: spec 001's `.env.example` placeholders are syntactically valid on purpose (§13 Q10), so
a clean clone builds and runs offline apart from the package registry.

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node | 24 (the major in `.node-version` / `.nvmrc`; `engines` accepts `>=24`) | `fnm use` / `nvm use`, or `brew install node@24` |
| pnpm | 12.3.4 (pinned by `packageManager`) | `corepack enable` on Node 24, else `brew install pnpm` |
| git | any current | — |
| `gh` | any current | `brew install gh`, then `gh auth login` — needed for PRs and `pnpm branch-protection` |
| `python3` | 3.9+ | preinstalled on macOS; the PreToolUse guard parses its payload with it |
| gitleaks | 8.x (optional locally) | `brew install gitleaks` — without it `pnpm test` skips 5 secret-scanning tests |

```bash
node -v    # v24.x (v26 also works: engines is >=24)
pnpm -v    # 12.3.4
```

## 2. Clone and install

```bash
git clone https://github.com/itsahmeds/flowers-overseas.git
cd flowers-overseas
pnpm install --frozen-lockfile
```

Expected tail:

```
Done in 30s using pnpm v12.3.4
```

`pnpm install` also runs `prepare` → `husky`, which installs the pre-commit hook (lint-staged +
`tsc --noEmit`) and the commit-msg hook (commitlint). If you skipped it with `--ignore-scripts`,
run `pnpm exec husky` before your first commit or the hooks are silently absent.

## 3. Environment

```bash
cp .env.example .env.local
```

That is enough to build and run. Every key is documented in `.env.example` itself (purpose · where
the real value lives · secret or not), and `src/lib/env.ts` validates the set at build time.

For a contributor whose Vercel project is linked (`vercel link` — founder only, see
`docs/runbooks/vercel-setup.md`), the real values come from the env store instead:

```bash
vercel env pull .env.local          # development environment by default
vercel env pull .env.local --environment=preview
```

`vercel env pull` is **optional in spec 001**: no code path reaches Supabase, Stripe, Resend or
Sentry yet, so the placeholders behave identically. From spec 002 (real database) it is the normal
path, and `.env*.local` is git-ignored either way.

## 4. Run it

```bash
pnpm dev
```

Expected:

```
▲ Next.js 16.3.4
- Local:   http://localhost:3000
✓ Ready in 1.2s
```

Then, in a second shell:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","version":"dev","env":"development"}

curl -sI http://localhost:3000/api/health | grep -iE 'cache-control|x-robots-tag|x-request-id'
# cache-control: no-store
# x-robots-tag: noindex
# x-request-id: 6f9…  (UUID v4, echoed when you send your own)
```

`/` renders an intentionally empty, `noindex` shell — no header, no copy, no fonts (spec 001 §5.3);
spec 003 and 004 fill it. `pnpm build && pnpm start` runs the production build if you need to check
the production-only response headers.

## 5. Verify the gates and the task guard

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm format:check && pnpm check-layout \
  && pnpm codebase:map --check && pnpm specs:index --check && pnpm tasks:check
```

The dev OS itself is testable, and worth exercising once so its failure mode is familiar:

```bash
.claude/bin/task.sh show      # prints the active task or "no active task"
.claude/bin/task.sh set TASK-999   # exits 1: "not found in TASKS.md"
pnpm dev-os:check             # runs the guard/task.sh/Stop-hook checks against temp projects
pnpm codebase:map             # rewrites docs/codebase-map.md after adding a module, route or script
pnpm tasks:brief TASK-086     # scaffolds docs/tasks/TASK-086.md from the template
```

Inside a Claude Code session, an `Edit` or `Write` under `src/ app/ supabase/ emails/ seed/ tests/`
with no active task is **denied** by `.claude/hooks/task-guard.sh` with a reason containing
`no task is active`. That is not a bug: set the task first with
`.claude/bin/task.sh set TASK-NNN` (the row must already exist in `TASKS.md`), and clear it when
the PR is open. `pnpm dev-os:check` never touches this repository's real
`.claude/state/active-task`.

## 6. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `corepack: command not found`, or Corepack refuses to run | Corepack was unbundled from Node 25+ | `brew install pnpm` (or `npm i -g corepack`); the `packageManager` pin still applies |
| `ERR_PNPM_BAD_PM_VERSION` | a globally installed pnpm older than 12.3.4 | `corepack use pnpm@12.3.4`, or upgrade the Homebrew pnpm |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` and the lockfile disagree | you are on a stale branch: `git pull`, then `pnpm install` |
| Build fails with `invalid environment variables` and a key name | `.env.local` missing or missing that key | `cp .env.example .env.local`. The error prints the **variable name only, never a value** — by design (AC-10) |
| `pnpm test` reports `5 skipped` | gitleaks is not installed | expected locally; `brew install gitleaks` to run them, and the `audit` CI job always does |
| Claude Code refuses to edit a file under `src/` | the PreToolUse guard, no active task | `.claude/bin/task.sh set TASK-NNN` (§5) |
| `pnpm lighthouse` fails with `NO_FCP` | `/` paints nothing yet | expected until spec 004; the CI job is informational (`continue-on-error: true`, spec 001 §13 Q4) |
| `pnpm lint:fixtures` "fails" | it is supposed to | `tests/fixtures/lint/` violates the custom rules on purpose; exit 1 with a list of files is the pass condition |
| Playwright: `browserType.launch: Executable doesn't exist` | browsers not downloaded | `pnpm exec playwright install chromium` |
| `pnpm branch-protection` exits 1 with `UNAVAILABLE ON THIS PLAN` | private repo on GitHub Free | expected; see `docs/runbooks/branch-protection.md` §0 |
| `pnpm test:integration` reports everything skipped | no schema until spec 002 | expected (spec 001 AC-16) |

Still stuck: `README.md` "Troubleshooting" has the same list in short form, and
`docs/architecture.md` §4 lists everything spec 001 deliberately left undone.
