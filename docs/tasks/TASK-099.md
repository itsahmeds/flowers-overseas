# TASK-099 — PR environments and the CI preview rewrite: Railway PR environments forked from `staging` (`APP_ENV=preview`, own `NEXT_PUBLIC_SITE_URL`, shared staging DB, removed on close), `preview` job resolves the proxied URL (fails, never skips, at 15 min) and asserts 401 / `x-fo-region` / `X-Robots-Tag: noindex`, `e2e`/`visual`/`a11y`/`lighthouse` repointed, the Vercel wait dropped; the local gate-set transcript recorded per PR while Actions billing is blocked

Row: `TASKS.md` → TASK-099. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-099`; keep it current by editing this file, not the row.

## Binding

What the spec binds this task to, in the spec's own words: the resolution notes that override
defaults, the AC ids owned, the rulings from earlier reviews that apply here, the gates that must
be green. One paragraph or a short list — no restatement of the spec.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From TASK-134 / orchestrator ruling (2026-09-18):** regenerate the stale `tests/visual/__screenshots__/visual/linux/` Playwright baselines (3 PNGs vs 82 `darwin`; TASK-056 deferral) from the first green `visual` job artefact once this task's preview rewrite makes `preview` → `visual` runnable on a PR (`ci:full` label). `darwin/` untouched. TASK-134's `## Escalations` has the analysis of `ci.yml`'s `needs: preview` gate.

- **From `/review 80` (2026-09-18, TASK-098):** (1) add a `container` job to `ci.yml` — `docker build --target runtime`, run it, `curl /api/health` — so spec 040 T-08 is a test, not a runbook step; (2) make `STAGING_BASIC_AUTH` **required** on `staging` and `preview` in `src/lib/railway.ts` (still unexpected on `production`) so `railway:check --env` catches a missing wall.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
