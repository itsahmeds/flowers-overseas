# Session handoff — 2026-09-15/16 (orchestrator, new Mac, day 2)

Read this first, then `TASKS.md` (Log, last ~25 lines), then `docs/sessions/2026-09-15-orchestrator-handoff.md` for the machine/process rules (still valid).

## Where the project stands

| | |
|---|---|
| Phase 0 | **61 / 96** tasks · 7 / 12 specs approved · drafts 008, 009, 040 awaiting founder rulings |
| Merged this session | PR 59 (TASK-084), PR 60 (spec 007 artboards), PR 61 (TASK-056, spec 004 gates), PR 63 (TASK-087, corridor content system) |
| Merged at close | PR 64 (TASK-089 occasion dates) |
| **Needs `/review`** | **PR 65** (TASK-090 SEO rule engine) — dispatch the full reviewer first thing; then founder merges |
| Reviewed, merge gated | PR 62 (TASK-013 env contract, PASS) — gated on **Railway** variables now (ADR-0018), not Vercel |
| **TASK-088 → draft PR 66, blocked on two gate rules** (orchestrator ruled A3/A4 in spec 007 §14: `relatedIso2` 2–3 band; rule 5 = 5-gram shingle ≥ 0.80). Next: re-dispatch `/implement TASK-088` to apply A3/A4 in the gate + schema + fixtures inside PR 66, mark ready, `/review 66`. Worktree `~/dev/fo-wt-088` TASK-088 six `en` guides + seven `en-gb` overrides (branched from PR 63's head; rebase onto `main`). **First action next session:** `git -C` each worktree `status`/`log origin/main..HEAD`; if a PR exists, dispatch `/review`; if work is uncommitted/partial, re-dispatch `/implement TASK-0xx` telling the agent to continue from the worktree state. |
| Specs drafted | 008 shop/category/occasion pages (28 AC, ~14 tasks), 009 PDP + date picker (13 tasks), 040 hosting Railway+Cloudflare (33 AC, 8 tasks) |
| Infra | Railway project `flowers-overseas` (Grovant's workspace; envs production/staging; **no service, no deploy** until `APP_ENV` lands) · Cloudflare zone `flowersoverseas.com` on the founder's account, GoDaddy NS switched to `cruz`/`lex.ns.cloudflare.com` (check `dig NS`) · Neon + R2 secrets live-verified in `.env.local` · `grovant` GitHub admin (invite pending) · Railway + Vercel CLIs installed; Vercel not linked |

## Founder decisions pending (block ~35 tasks)
1. **Accept ADR-0018** (Railway behind Cloudflare) → update `CLAUDE.md` stack line, supersede `vercel-setup.md`.
2. **Spec 008 §13 Q1–Q10** (key: Q2 `?page=N` behind the edge cache vs `/page/N`), **spec 009 §13 Q1–Q8** (key: Q2 demo picker `preview` state; Q4 drop countdown; Q5 one ≤2 048 B island amending spec 007 AC-24), **spec 040 §13 Q1–Q6** (key: Q2 transfer the Railway project to a founder-owned workspace). "Accept all defaults" is the expected answer; then mark approved, run the design rounds (008/009 artboards), `/plan-tasks` each.
3. Skim `content/corridors/en/pl-guide.md` (and TASK-088's files when they land) before any `reviewed: true`.
4. Set the 11 Railway variables (spec 040 task 2 will define where) → merge PR 62 → TASK-014 starts the schema lane.
5. GitHub Actions billing (still blocked since 09-09; every review costs 20–40 min of laptop time). Delete the lost R2 token `flowersoverseas-app`. File Neon/Cloudflare/Railway DPAs.

## Dispatch order (two local slots + unlimited cloud writers)
Site lane: `/review 65` → merge → TASK-088 round 2 (A3/A4) → `/review 66` → merge → **TASK-091 corridor route** (frontend; pixel-for-pixel to `docs/design/wireframes/corridor-country-*.dc.html`) → 092 hub + links → 093 ∥ 094 → 095 → 096 (founder-gated, domain). After rulings: 008 design round + plan, 009 design round + plan, 040 plan → **040 task 1 `APP_ENV`** can run in the cloud immediately (host-agnostic).

## Lessons this session
- **Cloud agents work** (`isolation: "remote"`) for spec-writers but the sandbox had **no shell**: they write files in `.claude/worktrees/agent-*`; the orchestrator copies the file, runs `pnpm specs:index`, commits, and removes the worktree. Do not use remote isolation for implementers that must run gates.
- Parallel implementers on one module (`src/modules/geo`) all edit the barrel, the `check:no-db` scope list, `docs/architecture.md` and the codebase map → one rebase per PR. `architecture-doc.test.ts` pins the owner cell to the barrel comment verbatim.
- `.claude/state/active-task` is one pointer shared by all worktrees; agents must `task.sh set` right before guarded edits.
- The classifier blocks `gh pr merge`, pushing squashes, and the Cloudflare token page; the founder merges (from inside the repo or with `--repo`). Secrets are pasted by the founder and verified by shape + live call only.
- Reviewers found real defects in every full review (manifest path, `zł` regex, wrong Mothering Sunday dates in the spec itself). Keep full reviews on anything user-facing or gate-shaped.
