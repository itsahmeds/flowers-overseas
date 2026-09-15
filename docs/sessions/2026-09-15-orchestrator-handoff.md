# Session handoff — 2026-09-14/15 (orchestrator, new Mac)

Read this first next session, then `TASKS.md` (Log's last ~15 lines), then `specs/007-corridor-pages.md` §13 resolution.

## Machine and process (changed this session)

- **New Mac, fresh clone at `~/dev/flowers-overseas`.** Old worktrees and `.env.local` were lost with the previous machine. Toolchain: fnm → Node 24.21.0, pnpm 12.3.4 (corepack), Playwright chromium, `~/.config/husky/init.sh` for hook PATH. Worktrees live at `~/dev/fo-wt-NNN` with `node_modules` symlinked (Turbopack panics on the symlink → `cp -c -R` clone before a build).
- **Secrets restored and live-verified** (Neon pooled + unpooled as `neondb_owner`, PG 18.6 Frankfurt; R2 signed `ListObjectsV2` 200 on both buckets). Secrets never pass through the orchestrator: the founder pastes, the orchestrator verifies by shape and by live call, printing statuses only.
- **Thermal rule: max two concurrent agents, one build / Playwright suite / Lighthouse pass at a time.** Agents wait on `pgrep -f "next build|lhci|playwright"` before building.
- **Classifier blocks the orchestrator from `gh pr merge`, from pushing a squash of a PR branch, and from the Cloudflare token page.** The founder merges (from inside the repo or with `--repo`). The orchestrator rebases PR branches when `TASKS.md` conflicts (implementers no longer edit `TASKS.md` on their branches — the orchestrator edits it on `main` only).
- Models: Fable orchestrates; every subagent is Opus (`model: "opus"` on each Agent call).

## Where the project stands

| | |
|---|---|
| Phase 0 | 58 / 96 tasks · 7 / 12 specs approved (007 approved 2026-09-15, all defaults) |
| `main` | see `git log`; ledger current |
| Merged this session | PR 59 (TASK-084 brand voice), PR 60 (spec 007 artboards) |
| In review | PR 61 (TASK-056 spec 004 close, full reviewer), PR 62 (TASK-013 env contract, full reviewer) |
| Planned, ready | TASK-087, TASK-089, TASK-090 (no deps) → 088, 091 → 092 → 093 ∥ 094 → 095 → 096 (founder-gated) |
| Blocked on TASK-013 merge | 014…031 (schema lane = the CMS prerequisite), 070/071, 082/083 |

## Founder decisions this session

Website and CMS first (decisions-log 2026-09-14). Strategy questions C1–C3 (organic-first priority, corridor breadth, Pakistan corridor) closed on defaults 2026-09-15. Spec 007 §13 Q1–Q10 defaults. TASK-056 escalations (consent sheet stays client-rendered; GA4 off; delivery-photo strings gated on spec 027; dates band snapped to tokens). PR 60 design defaults (Andrzejki/Wigilia off the corridor calendar; three hub regions; featured section dropped; `h1` differs by state; Polish-not-yet FAQ item stays; `guideWaitingList` → `guideNotDelivering`).

## ⚠️ Founder actions outstanding

1. **Vercel env for PR 62** — set the 11 required variables in preview + production and delete `ALLOW_PLACEHOLDER_ENV` + the three Supabase variables **before** merging PR 62 (placeholders then fail production builds by design).
2. **GitHub Actions billing** — still blocked since 2026-09-09; every review reproduces the suites locally (20–40 min each). Also blocks `linux/` visual baselines (TASK-056 deferred them).
3. Delete the lost 2026-09-11 R2 token `flowersoverseas-app`; optionally delete the unused US Neon project `soft-darkness-33998532`.
4. File the Neon and Cloudflare DPAs under `docs/compliance/`.
5. Skim the founder copy-review queue (8 `en` keys from TASK-084) and, later, the `en` corridor corpus (`reviewed: true` gates indexability).
6. Production domain + `NEXT_PUBLIC_SITE_URL` for TASK-096 (13–16 Oct window).

## Next dispatches (in order, two at a time)

1. On `/review 61` PASS → founder merges → TASK-056 `done`, spec 004 closed (8 tasks left in 004: only TASK-058 CSP enforcement).
2. On `/review 62` PASS → founder sets Vercel vars → merges → TASK-013 `done` → TASK-014 (data layer foundation) starts the schema lane.
3. Site lane: TASK-087 (backend) + TASK-089 (backend) as soon as two slots free; then 090, 088, 091.
