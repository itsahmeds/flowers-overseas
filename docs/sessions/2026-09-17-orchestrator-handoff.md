# Session handoff — 2026-09-16/17 (orchestrator, day 3)

Read this first, then `TASKS.md` (Log, last ~30 lines), then `docs/sessions/2026-09-16-orchestrator-handoff.md` and `2026-09-15-…` for the machine/process rules (still valid, amended below).

## Where the project stands

| | |
|---|---|
| Phase 0 | **68 / 133** tasks · 10 / 12 specs approved (001–009 + 040) |
| Merged this session | PR 62 (TASK-013 env contract), 65 (TASK-090 SEO engine), 66 (TASK-088 corpus), 67 (spec 008 artboards), 68 (TASK-097 `APP_ENV`), 69 (spec 009 artboards), 70 (TASK-091 corridor route), 71 (TASK-014 db foundation), 72 (TASK-105 slugs) |
| **In flight at close** | **TASK-092** hub + link publishing (`~/dev/fo-wt-092`, branch `task/TASK-092-destinations-hub-links`, **7 commits pushed, no PR**: route, link publishing, key rename, view-model/crawl/axe/visual tests, architecture row, a WIP Lighthouse URL set; the agent stalled at the Lighthouse run — remaining: Lighthouse on the two hub URLs, full gate list, PR) · **TASK-108 landed after close as PR 73** (ready, MERGEABLE) — **dispatch `/review 73` first**; note its escalation 3 (`nav.category.bestSellers` / `sameDayDelivery` in the header → TASK-120's scope) and 4 (mobile header axe violation → chrome owner). **First action:** `git -C` each worktree `status` / `log origin/main..HEAD`; PR exists → `/review`; no PR → re-dispatch `/implement TASK-0xx` as a **fresh** agent with a "finish from this worktree state" brief listing the commits (do not resume the old agent). |
| Specs approved today | 008 shop/category/occasion (planned TASK-105…118), 009 PDP + date picker (planned TASK-121…133), 040 hosting (planned TASK-097…104) — all §13 defaults; ADR-0018 accepted |
| Rulings recorded | spec 003 §14 A14 **locale suggestion popup** (IP-aware via `/api/geo`, no redirect, TASK-119) · spec 004 §14 A19 gate the same-day/cutoff chrome strings (TASK-120, widened to header/footer) · spec 006 §14 A6 **ChatGPT is the image generator** (no seed, no negative param, 1536 px) · spec 007 §14 A3/A4 (related band, shingle distinctness), A5 (`robots.txt` `sort=` only), A6 (trailing slash = 308/301 to bare) · spec 008 §14 A1 evergreen hub existence · spec 040 §13 Q2 **reversed: Railway stays in Grovant's workspace** · GA4 deferred until the founder supplies the id · all 14 corridor guides `reviewed: true` (founder, on trust) |
| Founder deliverables produced | `content/imagery/requirements-phase0.md` + CSVs (31 assets, ChatGPT sizes/prompts) |
| Infra | Railway project in Grovant's workspace (stays); Cloudflare zone live; Neon has migration `0001` applied (roles `app_owner`/`app_web`, `set_updated_at()`); `APP_ENV` merged — Railway production deploy is no longer forbidden by ADR-0018, staging is TASK-098 |

## Founder decisions pending
1. **GitHub Actions billing** — zero steps have run on any PR since 2026-09-16 15:11; every review reproduces suites locally (20–40 min each). Still the biggest tax.
2. **TASK-106 inputs**: ~55 `de`/`pl` category + occasion slugs and the default-sort curation order (a URL is never machine-drafted).
3. **Imagery**: generate the 31 assets in ChatGPT per the sheet; paste OpenAI's terms into `docs/compliance/imagery-generator-terms.md`; TASK-080 then swaps `generator` fields and re-hashes.
4. GA4 measurement id, whenever the site is "built".
5. Cloud lever: founder's rule keeps cloud isolation for spec-writers; TASK-097 ran in the cloud with a full shell and produced a clean PR. Ask again if throughput matters — hosting (098/100/102) and backend-only tasks are the candidates.

## Dispatch order (two local slots; one build/Playwright/Lighthouse at a time)
Site lane: finish 092 → `/review` → 093 ∥ 094 → 095 (depends on TASK-120) → 096 (Oct, founder-gated). Shop lane: 108 → `/review`; 107 (needs 105 ✓) → 109 → 110/111/112 … Product lane: 122 ∥ 123 unblocked now; 121 (needs 105 ✓). Schema/CMS lane: 015 (needs 014 ✓) → 016… Hosting: 098 (founder pastes Railway vars + `STAGING_BASIC_AUTH`), 100 (founder pastes the scoped Cloudflare token), 102. Also unblocked: 119 (popup; draw the dialog in `components.dc.html` first), 120 (honest cutoff copy).

## Lessons this session
- **Stream stalls (2026-09-16 22:30 → 09-17 ~08:00 PKT):** every Opus background agent hit the 600 s watchdog; a one-command probe took 480 s at 07:54 and 3 s at 14:01. Not the Mac. Mitigation now standard: implementers commit after each coherent step, one command per tool call; a twice-stalled agent is replaced by a **fresh** finisher agent with a tight brief (it worked first time for TASK-105).
- **Orchestrator edits to content/tests need the same care as code:** flipping `reviewed: true` on `main` broke two fixture pins and a generated index on an open PR. Run `pnpm test` on the touched area before pushing to `main`.
- `git add -A` on `main` once swept a `.claude/worktrees/agent-*` folder into a commit; `.claude/worktrees/` is now gitignored.
- Squash-merged stacked PRs (68 on 62, 69 on 67) need `git rebase --onto origin/main <old-base-head>` to drop the merged commits; conflicts then shrink to the map/barrel/architecture rows.
- `tests/unit/dev-os.test.ts` scans the shared OS tmpdir and flakes when two worktrees test at once — rerun alone before counting it (TASK-095/010 follow-up).
- Session agent types are not registered when the session starts in a scratch folder; `change_directory` first, or dispatch `general-purpose` pointed at `.claude/agents/<role>.md`.
- Commit headers ≤100 chars (commitlint); a literal `|` in a `TASKS.md` cell breaks the table check; `pnpm` 12 has no `-s`.
