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

- **From `/review 80` (2026-09-18, TASK-098):** (1) **TAKEN by TASK-135 (2026-09-18) — do not build twice.** Add a `container` job to `ci.yml` — `docker build --target runtime`, run it, `curl /api/health` — so spec 040 T-08 is a test, not a runbook step; (2) make `STAGING_BASIC_AUTH` **required** on `staging` and `preview` in `src/lib/railway.ts` (still unexpected on `production`) so `railway:check --env` catches a missing wall.
- **From `/review 104` round 3 (2026-09-28):** spec 040 A2 clause 2 (~L890) says `lighthouse` moves off the runner-served origin. If this task re-points `lighthouse` at the PR URL, it becomes `needs: preview`, **skips on every push to `main`**, and spec 040 A3's gate 1 (which requires `lighthouse` = `success`) halts every release. Keep `lighthouse` on `needs: build` with no `if:`, or raise it as an escalation. T-39 goes red otherwise.
- **Rescued from `/review 90` round 2 (2026-09-21, via PR 105, 2026-09-28):** `playwright.config.ts` L9–18 still describe the Vercel preview (`baseURL` from the `preview` job's output; `x-vercel-protection-bypass` on every request). Neither is true in CI since TASK-137: the origin is the runner's `http://localhost:3000`, and `protectionBypassHeaders` is `{}`. Spec 040 A2 clause 3 lists three docstrings to correct and leaves this file out. Correct it with AC-26 here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
