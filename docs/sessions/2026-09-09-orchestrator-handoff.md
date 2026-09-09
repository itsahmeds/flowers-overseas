# Session handoff — 2026-09-09 (orchestrator)

Read this first in the next session, then `TASKS.md` (the Log section's last ~25 lines are today's history) and `specs/004-design-system-layout.md` §14 (A1–A5 are today's rulings).

## Where the project stands

| | |
|---|---|
| Phase 0 progress | 34 / 85 tasks done · 6 / 12 specs approved |
| `main` | `e52b2b7`, green (unit 1 8xx, lint, typecheck, build) |
| Specs approved today | 005 catalogue + pricing, 006 seed + imagery (all §13 defaults accepted; 006 Q1 = AI-generated or free-licence stock) |
| Merged today | PRs 26 27 28 29 30 31 32 33 34 35 (security headers, tokens/fonts/primitives, consent plumbing, registries, footer, header, design system rounds 1+2, catalog skeleton, catalogue dataset) |
| Localhost | `pnpm dev` → `/en` shows the real header (utility strip, sticky masthead, category row) and footer; the page body is still the placeholder until TASK-052 lands. Gallery at `/dev/components` (needs `ENABLE_DEV_UI=true` in `.env.local`) |
| Design canvas | Published for founder review: https://claude.ai/code/artifact/a87a9bbb-4e74-41cb-ae02-fbba510dedc9 (49 artboards, round 2 = competitor pass + first-person voice). Source of truth: `docs/design/` |

## In flight when the session ended (agents are gone; their worktrees remain)

The four background agents below ended with the session. PRs #36 and #37 have their fix rounds pushed and need only a re-check and merge; TASK-052 and TASK-072 were mid-build and may hold uncommitted work. **First action next session: `git -C <worktree> status && git -C <worktree> log --oneline -3` for each, then `gh pr view <n>` to see whether the fix round was pushed.** Re-dispatch the same brief (the review notes are in the session scratchpad and summarised in the TASKS.md Log lines for `/review 36` and `/review 37`).

| Worktree | Branch / PR | What was happening | Pick up by |
|---|---|---|---|
| `/Users/ahmed/Dev/fo-wt-051` | `task/TASK-051-consent-banner-islands` · PR #36 (ready) | Fix round after `/review 36` FAIL (mechanical: rebase onto main with 6 conflicts, 44 px toggle rows, correct the false HSTS sentence, nits). Consent logic itself passed every check. | **Fix round PUSHED (head `a9b2e30`) before the session closed:** rebased onto main (11 commits, 6 conflicts resolved: header + footer + consent mounts all render), toggle rows 358 × 44 px, HSTS sentence corrected, 4 consent-settings baselines regenerated; `/en` 132 044 B br (972 B over, informational per §14 A1 addendum); 2 005 unit / 358 e2e / 16 visual / 34 a11y green locally. Next: orchestrator re-check (unit, lint, typecheck, cold build, `budget:client-js`, consent e2e/a11y specs) → merge → mark TASK-051 `done` → this unblocks TASK-055 and TASK-085. |
| `/Users/ahmed/Dev/fo-wt-062` | `task/TASK-062-price-dataset-catalogue-check` · PR #37 (ready) | Fix round after `/review 37` FAIL: re-ladder all prices inside plan/10 §2.3 bands (spec 005 §14 A1: bands exact, steps approximate), gate add-on VAT rate and surcharge amounts, pin FX magnitudes, `docs/compliance/vat-rates.md`. | **Fix round PUSHED (head `1e0fe62`) before the session closed:** 1 500 rows re-laddered, 0 outside band, 14th check mode `surcharge-amount`, add-on VAT gated, 8/8 mutations caught, 1 999 unit green, `docs/compliance/vat-rates.md` added. Next: orchestrator re-check (unit, lint, typecheck, `catalogue:check`, build, `budget:client-js`), merge, mark TASK-062 `done`, add the nit-8 clause to TASK-069 (already on its row), dispatch TASK-063. Residual noted in the PR body: the gate reads bands from the same file it checks; the test's independent transcription is the real guard — move it into the gate in TASK-069. |
| `/Users/ahmed/Dev/fo-wt-052` | `task/TASK-052-home-hero-finder` · no PR yet | First implementation of the hero, finder card, proof row and `Media` wrapper. Was mid-build. | Check for commits; if partial, re-dispatch `/implement TASK-052` telling the agent to inspect and continue from the worktree's state. |
| `/Users/ahmed/Dev/fo-wt-072` | `task/TASK-072-seed-schemas-dataset-skeleton` · no PR yet | First implementation of spec 006's seed schemas + generated dataset skeleton (ADR-0017: projections of spec 005's dataset). | Same. |

## Dispatch order after those land

- Homepage lane (frontend): TASK-052 → **TASK-085** (option (b): strings-as-props, drop `NextIntlClientProvider`, ~10.7 KB; also fix `client-js-budget.ts` attributing island chunks to `/`) → TASK-053 → TASK-054 → TASK-055 (carries the disabled mobile-menu-button nit) → TASK-084 (brand-voice copy pass, §14 A5) → TASK-056 (gates/close) → TASK-058 (CSP enforcement, §14 A2).
- Catalogue lane (backend): TASK-062 → 063 → 064 → 065 → 066 → 067 → 068 → 069; 070/071 blocked on TASK-013 (Neon).
- Seed/imagery lane (backend): TASK-072 → 073, 074 (needs 062), 075, 076; 077 → 078; 079 waits for 052/056; 080/081 after 056; 082/083 blocked on TASK-013 (R2).
- Two lanes in parallel at most three or four agents — five concurrent Opus agents hit the founder's usage limit twice today.

## Standing rules learned today (also in memory)

- CI runs on demand only (spec 001 §14 A14): spine on `ready_for_review`, full chain behind the `ci:full` label. **Rebase onto main immediately before `gh pr ready`** or the event is consumed without a run. Never `git stash` in the shared `.git`. Never `pkill -f next` (the founder's dev server is on :3000; agents use 3600–3990).
- Agents run every gate locally (unit, lint, typecheck, cold build, `budget:client-js`, e2e/visual/a11y against their own `pnpm start`). Reviewers do the same; verdicts go in `TASKS.md`, not on the PR (posting reviews is blocked).
- Light orchestrator review for internal PRs (docs, tooling, config, schemas); full reviewer for UI, money, compliance, security.
- `docs/design/` is the design source of truth; every UI spec adds wireframes there before `/plan-tasks`; every page is benchmarked against competitors (docs/design/benchmarks/) before founder review.
- Brand voice (spec 004 §14 A5): first person — "we", "our florist in Warsaw"; never relay/corridor/partner/third party in customer copy; "across Europe", not "anywhere in the world"; specific over superlative.
- Client-JS budget 131 072 B Brotli (§14 A1) is not raised again; the 975 B breach from consent is informational until TASK-085.
- `dev-os.test.ts` fails under parallel worktree load (shared `$TMPDIR`); it is green alone. `linux/` visual baselines are refreshed once from a single `ci:full` run owned by TASK-053.

## Founder items (none block the build)

1. Review the design canvas; answer the five copy-blocking questions in `docs/design/benchmarks/README.md` (support hours incl. weekend; commission split + payout timing; refund clock; dispute body per market; complaint window from our photo) and the `/legal/partner-terms` → `/legal/florist-terms` slug rename.
2. Create Neon (Frankfurt) + Cloudflare R2 accounts → unparks spec 002 (TASK-013) and the five blocked tasks.
3. VAT rates for DE/FR/ES/IT/RO/NL are provisional (accountant) — `docs/compliance/vat-rates.md` after PR 37.
4. Skim `footer.reminders.consent` and `footer.payment.processor` sentences; real photos for the hero when available; GA4 id; Trustpilot claim; domain/mailbox.
5. GitHub Actions minutes: on-demand CI is working (spine runs when PRs are marked ready after a rebase). Public repo or a spending cap remains the founder's call.
