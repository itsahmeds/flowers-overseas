# Session handoff — 2026-09-18 (orchestrator, day 4, third session)

Read this, then `TASKS.md` (Log, last ~40 lines — **seven agents were still running when this was
written, so their outcomes are in the log, not here**), then `docs/sessions/2026-09-18-orchestrator-handoff.md`
for the standing rules that are still valid.

## Where the project stands

| | |
|---|---|
| Phase 0 | **76 / 135** tasks · 10 / 10 specs approved |
| Merged this session | PR 76 (TASK-107 listing view model), 77 (TASK-120 honest chrome copy), 78 (TASK-134 CI test budget), 80 (TASK-098 container + Railway staging), 79 (TASK-122 Orthodox Easter) |
| **Live** | **https://flowers-overseas.vercel.app** — home, all-destinations hub, 14 country guides in `en`/`en-gb`, `noindex` on purpose (correct off the real domain; TASK-096 owns the flip). Redeploys on every push to `main`. |
| **Railway staging** | Project `flowers-overseas` in Grovant's workspace, `web` service created from `config/railway.json`, domain `web-staging-dbe4.up.railway.app`, **all 25 variables set** (19 by the orchestrator, 6 secrets + `STAGING_BASIC_AUTH` by the founder via `railway variable set --stdin`). **The build fails** — see TASK-135. |
| Domain | `flowersoverseas.com` is already on Cloudflare nameservers and resolving. Indexing is a configuration act, not a build. |

## In flight at close — seven agents

Check `TASKS.md` for what landed; check `gh pr list` for their PRs. None had reported when this was written.

| Task | What | Worktree |
|---|---|---|
| TASK-080 | **Imagery on the live site** — the founder's top want. 31 approved originals, budgets, Lighthouse, visual | `~/dev/fo-wt-080` |
| TASK-093 | JSON-LD schema builders (`modules/seo/schema/`) | `~/dev/fo-wt-093` |
| TASK-094 | Sitemaps + hreflang parity (`modules/seo/sitemap/`) | `~/dev/fo-wt-094` |
| TASK-016 | Schema catalog + pricing, migration `0003` | `~/dev/fo-wt-016` |
| TASK-119 | Locale suggestion dialog, no redirect | `~/dev/fo-wt-119` |
| TASK-135 | Container builds without credentials | `~/dev/fo-wt-135` |
| `/review 81` | TASK-109 country shop root + shared per-depth routes | reads `~/dev/fo-wt-109` |

**PR 81 is the structural one**: it deletes spec 007's own route files and serves corridor, hub and
shop root through one `resolveLocalePath()`. Its merge unblocks TASK-110, 111, 114 — and **their
briefs are already written** (110, 111, 112), so they dispatch immediately.

## Merges owed by the founder
PR 81 when its review passes, then whatever the seven produce. The `Vercel` check fails on **every**
PR (empty env store on the cold fallback, ADR-0018) — it is never a reason to hold a merge.

## Founder decisions pending
1. **Point `flowersoverseas.com` at the app** — the gate on TASK-096 and therefore on being indexed.
2. **Unpark TASK-013 database provisioning** (parked 2026-09-08). Blocks TASK-070, 071, 082, 083.
3. **`de`/`pl` slugs + curation order for TASK-106** — without them the shop stays English-only.
4. GA4 measurement id — "later" (recorded).

## Rulings recorded this session
spec 002 §14 **A4** (review triple = prose-bearing tables only) · **A5** (`rule_type` CHECK widening rides TASK-016) ·
spec 007 §14 **A8** (corridor route shared per depth; `revalidate` 86 400 → 3 600) ·
spec 008 §14 **A5** (one route file per URL depth + `resolveLocalePath()`; proxy rewrite rejected) ·
**A6** (`occasionDates` on the shop root) · **A7** (trailing slash = 308 site-wide) · **A8** (four scoping notes) ·
**A9** (spec text governs over a stale artboard; delivery-facts panel not on the shop root) ·
**A10** (occasion table's third column defers to TASK-111) ·
spec 009 §14 **A4** (Andrzejki/Wigilia → TASK-106) · **A5** (CHECK widening → TASK-016) ·
ADR-0014 condition met — **imagery generator terms filed**, TASK-080 unblocked.

## Process changes made this session
- **Open every PR `--draft`, then `gh pr ready`.** `ci.yml` triggers on `[ready_for_review, labeled]`
  only, so a PR created ready fires **nothing**. This silently cost several PRs their CI today. Now in `CLAUDE.md`.
- **Parallelism raised to seven agents** on the founder's instruction, with one build/Playwright/
  Lighthouse at a time enforced in every prompt: check `pgrep -fl "next build|next start|playwright|lighthouse"`,
  sleep-loop until clear, then use an assigned port (3201–3206). 8 cores / 16 GB held at load ~9.
- **Cloud isolation is not honoured** — agents requested with `isolation: "remote"` run as local
  worktrees under `.claude/worktrees/` and compete for the same build slot. Treat "cloud" as local.
- **ESLint is blind inside `.claude/worktrees/`** (dot-directory resolver), reporting phantom
  `import/no-restricted-paths` errors. Reviews must use an ordinary `~/dev/fo-wt-*` checkout.
- **Fleet ledger**: `python3 .claude/bin/ledger.py` → `docs/ledger/ledger.json`; published at
  https://claude.ai/artifact/1f9qu9kZ9ztd2acPr4EASE. `/session-summary` regenerates and republishes
  to that **same URL** (`url` parameter, never a new artifact).

## Lessons this session
- **Run the touched tests before any orchestrator commit to `main`.** Filing the imagery terms record
  broke `tests/unit/imagery-prompts.test.ts`; the next agent hit it within the hour.
- **While a PR edits its own `docs/tasks/TASK-NNN.md`, record the verdict only in the `TASKS.md` log.**
  Writing it into the brief made the founder's merge conflict; the branch had to be rebased.
- **A declared gap is a real gap.** `/review 80` passed TASK-098 with "nobody has run this container";
  the first real Railway build failed ninety seconds later on exactly that. TASK-135 is the fix.
- The 174 690-token TASK-109 run that wrote **no code** found the route collision that would have
  broken TASK-110–113 identically. Cheapest possible way to learn it.
- `gh pr ready --undo` then `gh pr ready` is how to fire CI on an already-ready PR.
