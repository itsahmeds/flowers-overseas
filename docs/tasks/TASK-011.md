# TASK-011 — CI completion and repo policy: `test:contract`, `db:check` stub, `env:check`, `audit` (pnpm audit + gitleaks), step summaries, job order per `plan/12` §5; PR template, CODEOWNERS, `renovate.json`; branch-protection verification

Row: `TASKS.md` → TASK-011. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-011-ci-completion-repo-policy`. Founder configures branch protection after the first green run and before merging PR 2 (§12 note a); implementer verifies via `gh api` (T-22). Renovate per §13 Q7; owner per Q1. Tests: T-22, T-28, T-29. Consider parsing ci.yml as YAML in `tests/unit/vercel-config.test.ts` rather than raw-text asserts. From review of PR #8: branch protection must require the PR-side `e2e`/`visual`/`a11y` checks (they do not run on push to main); T-16 localhost detection should match hostname (`localhost`/`127.0.0.1`/`::1`) not a string prefix. From review of PR #9: `lighthouse` is a red check on every PR until spec 004 (`continue-on-error: true`), so branch protection must exclude `lighthouse` from the required-check set while that is in force. From review of PR #10: fix `tests/dev-os/lib.sh` leaking `errexit` after `run_*` helpers (a red check aborts before its summary line, footer says 0 failed next to a FAIL row) and add a negative test that calls `run_guard` before a failing assertion; reconcile `dev-os-check`/`seo-validate` job positions with spec §2 order or correct the spec. **Branch-protection probe (2026-09-07):** `gh api repos/itsahmeds/flowers-overseas/branches/main/protection` → HTTP **403** `{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature."}` — not 404 `Branch not protected`. GitHub Free offers neither branch protection nor rulesets on a private repository, so AC-21's account half is **not applicable** on the current plan; the code half (job set + `scripts/branch-protection.ts --verify/--print-commands`, deriving the required set from `ci.yml` + `pr-policy.yml`) is done and `pnpm branch-protection` exits 1 with that message. **Founder action:** (1) upgrade `itsahmeds` to GitHub Pro, then run `pnpm branch-protection --print-commands` and apply both commands after PR #11's `ci` run is green (§12 note (a)); or record option 3 (unenforced protection, `/review` verdict as the gate) as the accepted deviation. (2) Independent of the plan and needed now: `gh repo edit itsahmeds/flowers-overseas --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --squash-merge-commit-title=PR_TITLE --squash-merge-commit-message=COMMIT_MESSAGES --delete-branch-on-merge` — the repo currently reports `allow_merge_commit: true`, `allow_rebase_merge: true`, `squash_merge_commit_title: COMMIT_OR_PR_TITLE`. Runbook: `docs/runbooks/branch-protection.md`. **Deviations recorded for TASK-012 to correct in spec 001:** (a) §2 "one approving review" → `required_approving_review_count: 0` + `require_code_owner_reviews: false`, because GitHub forbids self-approval and a solo founder with `CODEOWNERS = * @itsahmeds` would be unable to merge anything; the recorded `/review` verdict is the gate. (b) §2 job order: `seo-validate` and `dev-os-check` stay on `needs: typecheck` rather than after `lighthouse` — neither touches a preview deployment, so the spec's order would make the two fastest gates wait ~15 min for Vercel; and `env:check` is a step of `lint`, not a job, being a millisecond key-set diff. (c) `lighthouse` is excluded from the required-check set while `continue-on-error: true` (§13 Q4); the verifier derives this from the workflow, so spec 004 removing the flag makes it required with no code change. (d) `pnpm run audit` (not `pnpm audit`) is the composite gate: pnpm's built-in `audit` shadows the script name §2 gives it. Dependency added: `yaml` (devDependency, workflow parsing). Carry-forwards from PRs #7/#8/#10 all done: `ci.yml` YAML-parsed in `tests/unit/vercel-config.test.ts`, hostname-based local detection in `tests/e2e/shell.spec.ts`, `errexit` leak fixed in `tests/dev-os/lib.sh` with three negative tests proven red first.

## Read

- `specs/001-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `tests/unit/vercel-config.test.ts`
- `tests/dev-os/lib.sh`
- `docs/runbooks/branch-protection.md`
- `tests/e2e/shell.spec.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#11](https://github.com/itsahmeds/flowers-overseas/pull/11); `/review` pass recorded in `TASKS.md`.
