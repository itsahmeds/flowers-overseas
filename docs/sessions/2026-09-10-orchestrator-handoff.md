# Session handoff — 2026-09-09/10 (orchestrator)

Read this first in the next session, then `TASKS.md` (the Log section's last ~30 lines are this session's history), then `specs/006-seed-catalogue-import-imagery-pipeline.md` §14 (A1–A5 are this session's rulings).

## Where the project stands

| | |
|---|---|
| Phase 0 progress | **47 / 85** tasks done (34 at session start) · 6 / 12 specs approved |
| `main` | `e929862`, green locally (unit 2 5xx–2 6xx, lint, typecheck, cold build) |
| Merged this session | PRs 36 37 38 39 40 41 42 43 44 45 46 47 48 (consent islands; price dataset; seed schemas; seed price files; hero/finder/proof row; seed copy en/en-gb; imagery provenance; taxonomy read API; media variants CLI; tiers/add-ons API; `seed:check` gate; pricing core; `seed:diff`) |
| Specs amended | 006 §14 A1 (`catalog.*` namespace), A2 (first-person honesty label "our florist"), A3 (`SeedPriceSchema.sku`), A4 (no delivery timing in copy), A5 (`seed:diff` report shape, snapshot layout) |
| Decisions | `docs/decisions-log.md`: ADR-0017 clarification (projected files carry authored records; `to*Row()` at import time); plan/03 §9 gap → `plan/13` B15 (seventh occasion rule type for Orthodox Easter, spec 009 amendment) |

## ⚠️ Blockers only the founder can clear

1. **GitHub Actions is blocked on billing since 2026-09-09 17:00 UTC.** Every job fails at start (~3 s, zero steps) with the runner annotation "The job was not started because recent account payments have failed or your spending limit needs to be increased". Vercel previews were also rate-limited for 24 h (Hobby build limit). The repo is private on the free plan, so there is **no branch protection**; merges are governed by `TASKS.md`. Standing rule until restored: the orchestrator merges on the CI jobs that ran (if any) + a cold `pnpm build` + the task's suites run locally at the exact head, recorded in the log line. Do **not** rerun failed jobs while the block stands. Once restored, re-toggle `gh pr ready --undo N && gh pr ready N` on open PRs to get a spine run.
2. Design canvas review + the five copy-blocking questions in `docs/design/benchmarks/README.md` (unchanged from 09-09).
3. Neon + Cloudflare R2 accounts → TASK-013 → unparks 070/071/082/083.
4. Imagery generator choice + commercial-use terms filed in `docs/compliance/imagery-generator-terms.md` (stub is **pending**; blocks approving any asset and TASK-080's committed bytes).
5. Finder ships with **no pre-filled delivery date** (deliberate; needs spec 009's cutoff computation if a default is wanted). `<h1>` renders 28/42 px vs artboards' 34/46 (`--text-display-s` token, assigned to TASK-055).
6. VAT rates provisional (`docs/compliance/vat-rates.md`); `de`/`pl` copy 100 % machine-drafted and correctly non-indexable; `media.provenance.aiExample` in `de`/`pl` is the English string until the translation pass.

## In flight when the session ended (agents are gone; worktrees remain)

| Worktree | Branch / PR | State | Pick up by |
|---|---|---|---|
| `/Users/ahmed/Dev/fo-wt-079` | `task/TASK-079-media-loader-photo-provenance` · **PR #49 ready**, head `012a985` on `e929862` | Complete. Full `/review 49` was **running** (reviewer agent, Opus) when the session closed — no verdict recorded. | Re-dispatch the full reviewer with the same brief (UI + compliance: AC-2/17/18/19, honesty label, alt rules, preload, `<picture>` vs `next/image` deviation, the `seed/check.ts` alt-row edit, style-guide still says "your florist", English label in de/pl). Then merge on local gates → TASK-079 `done` → TASK-080 still waits on TASK-056. |
| `/Users/ahmed/Dev/fo-wt-085` | `task/TASK-085-strings-as-props-no-client-provider` · **PR #50 ready**, head `8339e2e` on `e929862` | Complete; report received at close. Budget (Brotli, browser-fetched set): `/` 135 357 → **116 778 B**; `/en` `/en-gb` `/de` `/pl` 136 363 → **122 360 B** — first time every AC-24 URL is inside 131 072 B (14 003 B saved on locale docs: provider + payload 10 705 B plus the catalogue leaving the root error-boundary chunk; 15 241 B of `/`'s old figure was never fetched — the attribution bug). `tests/e2e/client-js-budget.spec.ts` asserts set-equality between the script's model and Chromium's actual `/_next/static/**.js` requests (10/10). Unit 2 656 / 117 files, e2e 430, a11y 46, visual 18 unchanged. | **Full reviewer** (user-facing plumbing + spec 003 AC-28). Three judgement calls to rule on: (1) `import "server-only"` **not** added to `messages.ts` (plain-Node scripts/tests import it) — replaced by `tests/unit/client-message-graph.test.ts`, which walks every `"use client"` closure and fails on `messages.ts`, the barrel, `next-intl`/zod/Sentry, any `messages/*.json`; (2) one T-28 assertion changed (`not.toContain("Deutsch?")` → no rendered banner in HTML + `/en` byte-identical with/without `Accept-Language`) because `banner.headline` now travels server-resolved in the RSC payload; (3) `i18n-fifth-locale.test.ts` → `.tsx`. Then merge → TASK-085 `done` → **TASK-053** dispatchable. |
| `/Users/ahmed/Dev/fo-wt-066` | `task/TASK-066-fx-rounding` · no PR | Mid-build: `pricing/fx.ts` new, `money.ts`/`schemas.ts`/`types.ts`/`static/index.ts`/barrel edited, tests started (12 dirty files, uncommitted). | Re-dispatch `/implement TASK-066` telling the agent to inspect and continue from the worktree state (brief: `fxRateFor` fails closed past 48 h with an **injected** clock, `convert` integer-only with 250 bp buffer, `roundToStyle` upward-only monotone, `FxProvider` seam in `static/index.ts`, hand-computed FX table into `tests/fixtures/catalogue.ts`, AC-12 source scan, AC-15 `fxUnavailable` reason-key seam; display projection proper is TASK-067). Money → full reviewer. |

## Dispatch order after those land

- Homepage lane (frontend): TASK-085 → **TASK-053** → TASK-054 → TASK-055 (carries: disabled mobile-menu-button nit, `<h1>` type-scale token, consent sheet in `home.spec.ts` visual) → TASK-084 (brand-voice copy pass; carries duplicate cutoff phrasing, implementer copy marked `reviewedBy: founder`) → TASK-056 (gates/close; Lighthouse LCP re-measure after 085; permanent fix for the `registryLabel` TS2589 cast) → TASK-058 (CSP enforcement).
- Catalogue lane (backend): TASK-066 → 067 → 068 → 069 (carries six `/review 47` nits incl. the unimplemented surcharge-VAT-rate guard + `surcharge-vat-rate` check mode, `catalogue:check` reading bands from the module it checks, `docs/runbooks/pricing.md`); 070/071 blocked on TASK-013.
- Seed/imagery lane: TASK-079 (review) → TASK-080 (after 056; carries the 6 MB-cap finding — the 15-file ladder cannot fit 31 assets, pick slots/widths) → TASK-081; 082/083 blocked on TASK-013.
- Keep to **three or four concurrent Opus agents**. Never chain shell commands after `cd <worktree>` — twice this session the TASKS.md bookkeeping ran inside a worktree and pushed the wrong ref; use `git -C /abs/path` and absolute paths.

## Standing rules confirmed this session (also in memory)

- Subagents on Opus; orchestrator stays Fable. Light orchestrator review for internal PRs (schemas, tooling, data, backend modules with no money); full reviewer for UI, money, compliance, security — every full review this session found real blockers (36, 37, 40, 41) or passed with substantive nits (47).
- CI on demand only, and currently unavailable (above). Agents run every gate locally and record counts in the PR body; reviewers reproduce them.
- Design source of truth `docs/design/`; first-person brand voice spec 004 §14 A5 (nine banned words incl. "network"); no delivery-timing claims in copy (spec 006 §14 A4, enforced by `seed:check`).
- `dev-os.test.ts` flakes under parallel worktree load (shared active-task pointer / `$TMPDIR`); rerun alone before calling it red. `tests/unit/seed-prices.test.ts` byte-for-byte projection can hit the 5 s timeout on a loaded runner.
- Client-JS budget 131 072 B br not raised; main measured `/` 132.2 · `/en`/`/de` 133.2 KB br before TASK-085.
